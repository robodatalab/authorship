// A column beside the prose saying how much each line carries its section.
//
// One decoration type holds the column's shape; the text and colour of each row
// ride on the range, since every line says something different.
//
// The server does the reading and the writing: it is handed a path and a line
// and writes `<name>.attribution.yaml`, exactly as a build writes the graph. The
// POST only starts the job and a status poll follows it to the end; the scores
// are read back off the file, so a rewrite by any other hand draws the same way.

import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';

import type { ModelHealth } from '../llm/health';
import {
	attributionPathFor,
	covers,
	isLow,
	label,
	normalize,
	peakShare,
	summary,
	type SectionContribution,
} from './model';

/** How long the cursor must sit still before its section is asked for. */
const SETTLE_MS = 250;

/** How often to ask the server how the scoring is getting on. */
const POLL_INTERVAL_MS = 500;

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

	private shown: SectionContribution | undefined;
	private request: AbortController | undefined;
	private settling: NodeJS.Timeout | undefined;
	private enabled = false;

	constructor(
		private readonly port: number,
		private readonly status: ModelHealth
	) {
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((event) =>
				this.onCursor(event.textEditor)
			),
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				// The scores belong to the document they were read from.
				this.shown = undefined;
				if (editor) {
					this.onCursor(editor);
				}
			}),
			// An edit shifts every line below it, so the column stops describing the
			// prose it sits beside. Clearing is the honest response: percentages that
			// have quietly slid onto the wrong paragraphs are worse than none.
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (event.document === vscode.window.activeTextEditor?.document) {
					this.clear();
				}
			}),
			vscode.workspace.onDidSaveTextDocument(() => {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					this.onCursor(editor);
				}
			})
		);
	}

	toggle(): void {
		this.enabled = !this.enabled;
		if (!this.enabled) {
			this.clear();
			return;
		}
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			this.onCursor(editor);
		}
	}

	private onCursor(editor: vscode.TextEditor): void {
		if (!this.enabled || editor.document.languageId !== 'markdown') {
			return;
		}
		const line = editor.selection.active.line;
		// Moving about within a section changes nothing about its scores, and
		// re-asking on every arrow key would keep the encoder permanently busy.
		if (this.shown && covers(this.shown, line)) {
			return;
		}

		clearTimeout(this.settling);
		this.settling = setTimeout(() => void this.score(editor, line), SETTLE_MS);
	}

	/** Start a scoring job, follow it to the end, and draw what it wrote. */
	private async score(editor: vscode.TextEditor, line: number): Promise<void> {
		if (editor.document.uri.scheme !== 'file') {
			return;
		}

		this.request?.abort();
		const request = new AbortController();
		this.request = request;
		this.status.setScoring(true);

		try {
			const started = await fetch(`http://127.0.0.1:${this.port}/line_contribution`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: editor.document.uri.fsPath, line }),
				signal: request.signal,
			});
			if (!started.ok) {
				this.clear();
				return;
			}
			const { id } = (await started.json()) as { id: string };
			await this.followToEnd(id, request.signal);
			await this.load(editor);
		} catch (err) {
			// An abort is ours: the cursor reached another section first.
			if (!isAbort(err)) {
				this.clear();
				vscode.window.showWarningMessage(
					`Authorship could not score this section — is the model server running? (${describe(
						err
					)})`
				);
			}
		} finally {
			// Only if nothing has taken over since: a request aborted by a newer one
			// unwinds after that one announced itself, and would otherwise put the
			// bar back to idle while the encoder is still working.
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

	/** Read the scores the job wrote beside the manuscript. */
	private async load(editor: vscode.TextEditor): Promise<void> {
		const uri = editor.document.uri.with({
			path: attributionPathFor(editor.document.uri.path),
		});
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			const section = normalize(parseYaml(new TextDecoder().decode(bytes)));
			if (section) {
				this.draw(editor, section);
			}
		} catch {
			// A manuscript that has never been scored has no file, and a first run
			// has none for as long as it takes. That is an absence, not a fault.
			this.clear();
		}
	}

	private draw(editor: vscode.TextEditor, section: SectionContribution): void {
		this.shown = section;
		const peak = peakShare(section.lines);
		const lastLine = editor.document.lineCount - 1;

		const rows: vscode.DecorationOptions[] = [];
		for (const entry of section.lines) {
			if (entry.line > lastLine) {
				// The document was edited out from under the scores.
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
		editor.setDecorations(this.column, rows);
	}

	private clear(): void {
		this.shown = undefined;
		this.request?.abort();
		clearTimeout(this.settling);
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(this.column, []);
		}
	}

	dispose(): void {
		clearTimeout(this.settling);
		this.request?.abort();
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

/** Our own aborts — the cursor reaching another section — read as AbortError. */
function isAbort(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}

function describe(err: unknown): string {
	const message = (err as { message?: unknown } | null)?.message;
	return typeof message === 'string' ? message : String(err);
}
