// A column beside the prose saying how much each line carries its section.
//
// The file is what is drawn, not the request. `<name>.attribution.yaml` beside
// the manuscript accumulates a section at a time, and this watches it and paints
// whatever it holds — so a manuscript scored last week draws the moment it is
// opened, and scoring a second section leaves the first on screen.
//
// Editing takes scores away rather than leaving them to go quietly wrong: a
// section that has been written in is no longer the section that was scored, so
// its bars go from the screen and its entry from the file. Sections below the
// edit move with the prose and keep theirs.
//
// One decoration type holds the column's shape; the text and colour of each row
// ride on the range, since every line says something different.

import * as vscode from 'vscode';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { editsIn } from '../document/edits';
import type { ModelHealth } from '../llm/health';
import {
	afterEdits,
	attributionPathFor,
	denormalize,
	isLow,
	label,
	normalize,
	peakShare,
	summary,
	type SectionContribution,
} from './model';

/** How often to ask the server how the scoring is getting on. */
const POLL_INTERVAL_MS = 500;

/** How long after the last keystroke the pruned scores are written back. */
const WRITE_DEBOUNCE_MS = 400;

export class LineContributionGutter implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];

	/**
	 * The column itself. Width is fixed so the prose starts at one x whatever the
	 * numbers say, and the bars line up into something scannable — a ragged left
	 * edge would defeat the whole point of a column.
	 */
	private readonly column = vscode.window.createTextEditorDecorationType({
		before: {
			width: '13ch',
			margin: '0 1ch 0 0',
		},
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	});

	/** The manuscript being drawn, and the scores it has. */
	private document: vscode.Uri | undefined;
	private sections: SectionContribution[] = [];

	private watcher: vscode.FileSystemWatcher | undefined;
	private request: AbortController | undefined;
	private pendingWrite: NodeJS.Timeout | undefined;

	constructor(
		private readonly port: number,
		private readonly status: ModelHealth
	) {
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => this.follow(editor?.document)),
			// A manuscript can already be open when this is constructed, and can be
			// opened into a split without ever becoming active.
			vscode.window.onDidChangeVisibleTextEditors(() =>
				this.follow(vscode.window.activeTextEditor?.document)
			),
			vscode.workspace.onDidChangeTextDocument((event) => this.onEdit(event))
		);
		this.follow(vscode.window.activeTextEditor?.document);
	}

	/** Score the section the cursor is in. The file it writes is what gets drawn. */
	async score(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showInformationMessage(
				'Open a manuscript and put the cursor in the section to score.'
			);
			return;
		}
		if (editor.document.uri.scheme !== 'file') {
			return;
		}

		// A second ask supersedes the first here; the server supersedes the older
		// job on its own side, keyed by the file they both write.
		this.request?.abort();
		const request = new AbortController();
		this.request = request;
		this.status.setScoring(true);

		try {
			const started = await fetch(`http://127.0.0.1:${this.port}/line_contribution`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: editor.document.uri.fsPath,
					line: editor.selection.active.line,
				}),
				signal: request.signal,
			});
			if (!started.ok) {
				vscode.window.showWarningMessage(
					`Authorship could not score this section: ${await detailOf(started)}`
				);
				return;
			}
			const { id } = (await started.json()) as { id: string };
			await this.followToEnd(id, request.signal);
			// The watcher will have fired too, but a write landing between the two
			// would otherwise go unread.
			await this.load();
		} catch (err) {
			// An abort is ours, and means a newer scoring is already on it.
			if (!isAbort(err)) {
				vscode.window.showWarningMessage(
					`Authorship could not score this section — is the model server running? (${describe(
						err
					)})`
				);
			}
		} finally {
			if (this.request === request) {
				this.request = undefined;
				this.status.setScoring(false);
			}
		}
	}

	/** Poll the job's status until it is no longer running. */
	private async followToEnd(id: string, signal: AbortSignal): Promise<void> {
		for (;;) {
			await delay(POLL_INTERVAL_MS, signal);

			const response = await fetch(
				`http://127.0.0.1:${this.port}/line_contribution/status?id=${encodeURIComponent(id)}`,
				{ signal }
			);
			// A 404 means the server has no record of this job — it restarted, say —
			// so there is nothing left to wait for.
			if (!response.ok) {
				return;
			}

			const body = (await response.json()) as { running?: boolean; error?: string | null };
			if (body.error) {
				throw new Error(body.error);
			}
			if (!body.running) {
				return;
			}
		}
	}

	/** Watch the scores belonging to the manuscript now in front, and draw them. */
	private follow(document: vscode.TextDocument | undefined): void {
		if (
			!document ||
			document.languageId !== 'markdown' ||
			document.uri.scheme !== 'file'
		) {
			return;
		}
		// Already following it — the scores in hand are current, and what may have
		// changed is which editors are showing them.
		if (this.document?.toString() === document.uri.toString()) {
			this.draw();
			return;
		}

		this.watcher?.dispose();
		this.document = document.uri;
		this.sections = [];

		// The scores are rewritten by the server behind our back, so they are
		// watched and pushed rather than read once when the manuscript is opened.
		const scores = this.scoresUri();
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(vscode.Uri.joinPath(scores, '..'), basename(scores))
		);
		const reload = () => void this.load();
		watcher.onDidChange(reload);
		watcher.onDidCreate(reload);
		watcher.onDidDelete(reload);
		this.watcher = watcher;

		void this.load();
	}

	/**
	 * Drop the scores for every section the edit reached, and move the rest.
	 *
	 * The screen is repainted at once; the file follows on a debounce, because a
	 * write per keystroke would have the watcher reloading throughout a sentence.
	 */
	private onEdit(event: vscode.TextDocumentChangeEvent): void {
		if (
			event.document.uri.toString() !== this.document?.toString() ||
			event.contentChanges.length === 0 ||
			this.sections.length === 0
		) {
			return;
		}

		const surviving = afterEdits(this.sections, editsIn(event.contentChanges));
		if (surviving === this.sections) {
			return;
		}
		this.sections = surviving;
		this.draw();

		clearTimeout(this.pendingWrite);
		this.pendingWrite = setTimeout(() => void this.save(), WRITE_DEBOUNCE_MS);
	}

	/** Read the scores beside the manuscript and paint every section in them. */
	private async load(): Promise<void> {
		if (!this.document) {
			return;
		}
		try {
			const bytes = await vscode.workspace.fs.readFile(this.scoresUri());
			this.sections = normalize(parseYaml(new TextDecoder().decode(bytes)));
		} catch {
			// A manuscript that has never been scored has no file. That is an
			// absence, not a fault, and it draws as an empty column.
			this.sections = [];
		}
		this.draw();
	}

	/**
	 * Write the pruned scores back. The watcher then reloads them, so the screen
	 * is confirmed along the same path the server's writes take — there is no
	 * special case for our own.
	 */
	private async save(): Promise<void> {
		if (!this.document) {
			return;
		}
		try {
			await vscode.workspace.fs.writeFile(
				this.scoresUri(),
				new TextEncoder().encode(stringifyYaml(denormalize(this.sections), { lineWidth: 0 }))
			);
		} catch {
			// Nothing to write to means nothing was ever scored, and the screen is
			// already showing that.
		}
	}

	private draw(): void {
		const editors = vscode.window.visibleTextEditors.filter(
			(candidate) => candidate.document.uri.toString() === this.document?.toString()
		);
		if (editors.length === 0) {
			return;
		}

		const lastLine = editors[0].document.lineCount - 1;
		const rows: vscode.DecorationOptions[] = [];

		for (const section of this.sections) {
			// Each section is scaled to its own strongest line: the column is read a
			// section at a time, and a manuscript-wide scale would flatten a short
			// section against a long one.
			const peak = peakShare(section.lines);
			for (const entry of section.lines) {
				if (entry.line > lastLine) {
					// The manuscript has been cut back since it was scored.
					continue;
				}
				rows.push({
					range: new vscode.Range(entry.line, 0, entry.line, 0),
					// The bar carries the magnitude, so colour is free to carry the one
					// thing the length cannot: which lines the section would barely miss.
					renderOptions: {
						before: {
							contentText: label(entry.share, peak),
							color: new vscode.ThemeColor(
								isLow(entry.share, peak) ? 'charts.orange' : 'charts.blue'
							),
						},
					},
					hoverMessage: `${entry.share.toFixed(1)}% of this section\n\n${summary(section)}`,
				});
			}
		}

		for (const editor of editors) {
			editor.setDecorations(this.column, rows);
		}
	}

	private scoresUri(): vscode.Uri {
		const document = this.document as vscode.Uri;
		return document.with({ path: attributionPathFor(document.path) });
	}

	dispose(): void {
		clearTimeout(this.pendingWrite);
		this.request?.abort();
		this.watcher?.dispose();
		this.column.dispose(); // also clears the column from the editors
		for (const item of this.disposables) {
			item.dispose();
		}
	}
}

/** A promise that settles after `ms`, or rejects the moment `signal` aborts. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(abortError());
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(abortError());
			},
			{ once: true }
		);
	});
}

function abortError(): Error {
	const err = new Error('Aborted');
	err.name = 'AbortError';
	return err;
}

/** Our own aborts — a newer scoring taking over — read as AbortError. */
function isAbort(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}

function basename(uri: vscode.Uri): string {
	return uri.path.split('/').pop() ?? uri.path;
}

async function detailOf(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { detail?: string };
		return body.detail ?? response.statusText;
	} catch {
		return response.statusText;
	}
}

function describe(err: unknown): string {
	const message = (err as { message?: unknown } | null)?.message;
	return typeof message === 'string' ? message : String(err);
}
