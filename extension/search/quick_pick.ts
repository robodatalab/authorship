// Searching a manuscript for the passages that answer a phrase.
//
// The picker's own input is the query: the rows re-rank as it is typed, and
// moving down them reveals each passage in the editor behind — so a search is
// read in the prose rather than in a list. Accepting leaves every passage marked
// in the text and in the scrollbar, which is the part of the answer a single
// cursor cannot carry: a phrase is usually answered in more than one place.
//
// The vectors live in the server's memory, and encoding a manuscript takes as
// long as the manuscript is long. So indexing is a job — started when the picker
// opens, and again whenever a manuscript that has been searched is saved — while
// the search itself is an ordinary request against however much of the
// manuscript is encoded. The job is followed nowhere: it shows up in the job
// list like everything else long, and the search says what is left to encode.

import * as vscode from 'vscode';

import { normalize, rowDescription, rowLabel, title, type Hit } from './model';

/** How long after the last keystroke the phrase is sent. */
const QUERY_DEBOUNCE_MS = 250;

/** How long to leave the indexing job to get on before asking again. */
const PENDING_RETRY_MS = 1000;

interface Row extends vscode.QuickPickItem {
	hit: Hit;
}

export class ManuscriptSearch implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];

	/**
	 * Every passage that answered, marked where it sits.
	 *
	 * Whole-line and in the find-match colours, so it reads as a search result in
	 * whatever theme is on, and composes with the attribution column rather than
	 * competing for the same margin.
	 */
	private readonly matches = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
		overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
		overviewRulerLane: vscode.OverviewRulerLane.Center,
		isWholeLine: true,
	});

	/** Manuscripts the server has been asked to encode, and so worth re-encoding. */
	private readonly indexed = new Set<string>();

	private picker: vscode.QuickPick<Row> | undefined;
	private request: AbortController | undefined;
	private pending = 0;
	private query: NodeJS.Timeout | undefined;
	private marked: vscode.Uri | undefined;

	constructor(private readonly port: number) {
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument((document) => {
				// Only manuscripts somebody has asked a question of: saving a README
				// should not put a model on the GPU.
				if (this.indexed.has(document.uri.fsPath)) {
					void this.reindex(document);
				}
			})
		);
	}

	async search(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showInformationMessage('Open a manuscript to search it.');
			return;
		}
		if (editor.document.uri.scheme !== 'file') {
			return;
		}

		const document = editor.document;
		this.clear();

		// The server may never have seen this manuscript, or may have seen it
		// before the last hour of writing. Indexing what is already encoded costs
		// nothing, so it is asked for every time rather than guessed at.
		this.indexed.add(document.uri.fsPath);
		void this.reindex(document);

		const where = editor.selection;
		const picker = vscode.window.createQuickPick<Row>();
		picker.title = title(basename(document.uri), 0);
		picker.placeholder = 'Describe what you are looking for';
		this.picker = picker;
		this.pending = 0;

		let accepted = false;

		picker.onDidChangeValue((phrase) => this.schedule(document, phrase));
		picker.onDidChangeActiveItem((rows) => this.reveal(editor, rows[0]));
		picker.onDidAccept(() => {
			accepted = true;
			const row = picker.selectedItems[0];
			if (row && vscode.window.visibleTextEditors.includes(editor)) {
				editor.selection = new vscode.Selection(row.hit.start, 0, row.hit.start, 0);
				this.reveal(editor, row);
			}
			picker.hide();
		});
		picker.onDidHide(() => {
			clearTimeout(this.query);
			this.request?.abort();
			if (this.picker === picker) {
				this.picker = undefined;
				this.request = undefined;
			}
			// A search called off is a search that found nothing worth keeping on
			// the screen, and the cursor should be where it was left. Unless the
			// manuscript was closed out from under the picker, in which case
			// there is nothing left to put back.
			if (!accepted) {
				this.clear();
				if (vscode.window.visibleTextEditors.includes(editor)) {
					editor.selection = where;
					editor.revealRange(
						where,
						vscode.TextEditorRevealType.InCenterIfOutsideViewport
					);
				}
			}
			picker.dispose();
		});

		picker.show();
	}

	/** Send the phrase once it has settled, so a word is one search and not five. */
	private schedule(document: vscode.TextDocument, phrase: string): void {
		clearTimeout(this.query);
		this.request?.abort();

		if (!phrase.trim()) {
			this.show(document, [], this.pending);
			return;
		}
		this.query = setTimeout(() => void this.run(document, phrase), QUERY_DEBOUNCE_MS);
	}

	private async run(document: vscode.TextDocument, phrase: string): Promise<void> {
		const picker = this.picker;
		if (!picker) {
			return;
		}

		const request = new AbortController();
		this.request = request;
		picker.busy = true;

		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/search`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: document.uri.fsPath, phrase }),
				signal: request.signal,
			});
			if (!response.ok) {
				vscode.window.showWarningMessage(
					`Authorship could not search this manuscript: ${await detailOf(response)}`
				);
				return;
			}

			const results = normalize(await response.json());
			// The picker may have been dismissed, or the phrase moved on, while the
			// server was answering.
			if (this.picker !== picker || this.request !== request) {
				return;
			}

			this.pending = results.pending;
			this.show(document, results.hits, results.pending);

			// The indexing job is still working through the manuscript, so the answer
			// will improve on its own. Asking again is the only way to hear about it:
			// the job reports no progress, and a search is cheap.
			if (results.pending > 0) {
				this.query = setTimeout(() => void this.run(document, phrase), PENDING_RETRY_MS);
			}
		} catch (err) {
			// An abort is ours, and means a newer phrase is already on its way.
			if (!isAbort(err)) {
				vscode.window.showWarningMessage(
					`Authorship could not search this manuscript — is the model server running? (${describe(
						err
					)})`
				);
			}
		} finally {
			if (this.request === request) {
				this.request = undefined;
			}
			if (this.picker === picker) {
				picker.busy = this.pending > 0;
			}
		}
	}

	/** Put the passages in the picker, and mark where they all are. */
	private show(document: vscode.TextDocument, hits: Hit[], pending: number): void {
		const picker = this.picker;
		if (!picker) {
			return;
		}

		picker.title = title(basename(document.uri), pending);
		picker.items = hits.map((hit) => ({
			// The rows are ranked by meaning, and the picker would otherwise filter
			// them again by spelling — dropping every passage that answers the phrase
			// without repeating its words, which is the whole reason for asking.
			alwaysShow: true,
			label: rowLabel(hit),
			description: rowDescription(hit),
			hit,
		}));
		this.mark(document, hits);
	}

	/** Bring a passage into view behind the picker, without moving the cursor. */
	private reveal(editor: vscode.TextEditor, row: Row | undefined): void {
		if (!row || !vscode.window.visibleTextEditors.includes(editor)) {
			return;
		}
		editor.revealRange(
			new vscode.Range(row.hit.start, 0, row.hit.end, 0),
			vscode.TextEditorRevealType.InCenterIfOutsideViewport
		);
	}

	/**
	 * Mark every passage, in the prose and in the scrollbar.
	 *
	 * The picker shows one passage at a time and the cursor lands on one. Where
	 * the answers are relative to each other — clustered in a scene, or scattered
	 * through the book — is what a list cannot say, so the ruler carries them all.
	 */
	private mark(document: vscode.TextDocument, hits: Hit[]): void {
		const last = document.lineCount - 1;
		const ranges = hits
			.filter((hit) => hit.start <= last)
			.map((hit) => new vscode.Range(hit.start, 0, Math.min(hit.end, last), 0));

		for (const editor of editorsFor(document.uri)) {
			editor.setDecorations(this.matches, ranges);
		}
		this.marked = document.uri;
	}

	private clear(): void {
		if (!this.marked) {
			return;
		}
		for (const editor of editorsFor(this.marked)) {
			editor.setDecorations(this.matches, []);
		}
		this.marked = undefined;
	}

	/**
	 * Ask the server to encode the manuscript.
	 *
	 * Nothing waits on it. It appears in the job list like every other long thing,
	 * and the search reports what is left to encode as it goes.
	 */
	private async reindex(document: vscode.TextDocument): Promise<void> {
		if (document.languageId !== 'markdown' || document.uri.scheme !== 'file') {
			return;
		}
		try {
			await fetch(`http://127.0.0.1:${this.port}/search/index`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: document.uri.fsPath }),
			});
		} catch {
			// A server that is not running is worth saying when a search is asked
			// for, and not worth saying on every save.
		}
	}

	dispose(): void {
		clearTimeout(this.query);
		this.request?.abort();
		this.picker?.dispose();
		this.matches.dispose(); // also clears the marks from the editors
		for (const item of this.disposables) {
			item.dispose();
		}
	}
}

function editorsFor(uri: vscode.Uri): readonly vscode.TextEditor[] {
	return vscode.window.visibleTextEditors.filter(
		(editor) => editor.document.uri.toString() === uri.toString()
	);
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

/** Our own aborts — a newer phrase taking over — read as AbortError. */
function isAbort(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}
