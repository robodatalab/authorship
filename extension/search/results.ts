// The search a manuscript is currently under, and what it turned up.
//
// The results outlive the asking: they sit in the Search drawer until another
// phrase replaces them or the author clears them, and every passage stays lit in
// the prose the whole time. Clicking one sends the cursor there and picks that
// passage out from the rest.
//
// Nothing here draws. Highlighting goes through the orchestrator, which is what
// keeps the search's marks and the graph's from painting over one another.
//
// The vectors live in the server's memory, and encoding a manuscript takes as
// long as the manuscript is long. So indexing is a job, started when a search is
// asked for and again whenever a manuscript that has been searched is saved,
// while the search itself is an ordinary request against however much is
// encoded. The job is followed nowhere: it shows up in the job list like
// everything else long, and the search reports what is left.

import * as vscode from 'vscode';

import { editsIn } from '../document/edits';
import type { Highlights } from '../highlight/orchestrator';
import { afterEdits, normalize, type Hit } from './model';

/** Who this is, to the highlight orchestrator. */
const SOURCE = 'search';

/** How long to leave the indexing job to get on before asking again. */
const PENDING_RETRY_MS = 1000;

/** A search that has been run, and is still on the screen. */
export interface Results {
	/** The manuscript searched, shown root-relative in the drawer. */
	manuscript: string;
	phrase: string;
	hits: Hit[];
	/** Lines of prose the server has yet to encode. */
	pending: number;
	/** Set while the request is out, so the drawer can say it is working. */
	searching: boolean;
	error: string | null;
}

export class ManuscriptSearch implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly listeners: ((results: Results | null) => void)[] = [];

	/** Manuscripts the server has been asked to encode, and so worth re-encoding. */
	private readonly indexed = new Set<string>();

	private document: vscode.Uri | undefined;
	private results: Results | null = null;
	private request: AbortController | undefined;
	private retry: NodeJS.Timeout | undefined;

	constructor(
		private readonly port: number,
		private readonly highlights: Highlights
	) {
		this.disposables.push(
			vscode.workspace.onDidSaveTextDocument((document) => {
				// Only manuscripts somebody has asked a question of: saving a README
				// should not put a model on the GPU.
				if (this.indexed.has(document.uri.fsPath)) {
					void this.reindex(document.uri);
				}
			}),
			vscode.workspace.onDidChangeTextDocument((event) => this.onEdit(event))
		);
	}

	/** Told whenever the results change, so the drawer can repaint. */
	onChange(listener: (results: Results | null) => void): vscode.Disposable {
		this.listeners.push(listener);
		return {
			dispose: () => {
				const at = this.listeners.indexOf(listener);
				if (at >= 0) {
					this.listeners.splice(at, 1);
				}
			},
		};
	}

	current(): Results | null {
		return this.results;
	}

	/**
	 * Search the manuscript in the editor for a phrase.
	 *
	 * The manuscript is whichever one is open, not the one chosen in the Story
	 * drawer — a question about a story is asked of the story in front of you.
	 */
	async search(phrase: string): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showInformationMessage('Open a manuscript to search it.');
			return;
		}
		if (editor.document.uri.scheme !== 'file') {
			return;
		}
		if (!phrase.trim()) {
			this.clear();
			return;
		}

		const document = editor.document.uri;
		this.document = document;

		// The server may never have seen this manuscript, or may have seen it
		// before the last hour of writing. Indexing what is already encoded costs
		// nothing, so it is asked for every time rather than guessed at.
		this.indexed.add(document.fsPath);
		void this.reindex(document);

		this.publish({
			manuscript: vscode.workspace.asRelativePath(document),
			phrase,
			hits: [],
			pending: this.results?.pending ?? 0,
			searching: true,
			error: null,
		});
		await this.run(document, phrase);
	}

	/** Send the cursor to a passage and pick it out from the rest. */
	async reveal(index: number): Promise<void> {
		const hit = this.results?.hits[index];
		if (!hit || !this.document) {
			return;
		}
		await this.highlights.reveal(SOURCE, this.document, { start: hit.start, end: hit.end });
	}

	/** Put the answer away: no rows in the drawer, no marks in the prose. */
	clear(): void {
		clearTimeout(this.retry);
		this.request?.abort();
		this.request = undefined;
		this.highlights.release(SOURCE);
		this.document = undefined;
		this.publish(null);
	}

	private async run(document: vscode.Uri, phrase: string): Promise<void> {
		clearTimeout(this.retry);
		this.request?.abort();

		const request = new AbortController();
		this.request = request;

		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/search`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: document.fsPath, phrase }),
				signal: request.signal,
			});
			if (!response.ok) {
				this.failed(phrase, document, await detailOf(response));
				return;
			}

			const answer = normalize(await response.json());
			// The phrase may have moved on, or the answer been put away, while the
			// server was working.
			if (this.request !== request) {
				return;
			}

			this.publish({
				manuscript: vscode.workspace.asRelativePath(document),
				phrase,
				hits: answer.hits,
				pending: answer.pending,
				searching: false,
				error: null,
			});
			this.mark(document, answer.hits);

			// The indexing job is still working through the manuscript, so the
			// answer will improve on its own. Asking again is the only way to hear
			// about it: the job reports no progress, and a search is cheap.
			if (answer.pending > 0) {
				this.retry = setTimeout(() => void this.run(document, phrase), PENDING_RETRY_MS);
			}
		} catch (err) {
			// An abort is ours, and means a newer phrase is already on its way.
			if (!isAbort(err)) {
				this.failed(
					phrase,
					document,
					`is the model server running? (${describe(err)})`
				);
			}
		} finally {
			if (this.request === request) {
				this.request = undefined;
			}
		}
	}

	/**
	 * Move the results with the prose, and drop the ones written into.
	 *
	 * A passage that has been edited is no longer the passage that was found. The
	 * rest keep their place in the answer, so an afternoon of small edits does not
	 * cost the search that was already made.
	 */
	private onEdit(event: vscode.TextDocumentChangeEvent): void {
		if (
			!this.results ||
			!this.document ||
			event.document.uri.toString() !== this.document.toString() ||
			event.contentChanges.length === 0
		) {
			return;
		}

		const surviving = afterEdits(this.results.hits, editsIn(event.contentChanges));
		if (surviving === this.results.hits) {
			return;
		}
		this.publish({ ...this.results, hits: surviving });
		this.mark(this.document, surviving);
	}

	private mark(document: vscode.Uri, hits: Hit[]): void {
		this.highlights.claim(
			SOURCE,
			'findings',
			document,
			hits.map((hit) => ({ start: hit.start, end: hit.end }))
		);
	}

	private failed(phrase: string, document: vscode.Uri, why: string): void {
		this.publish({
			manuscript: vscode.workspace.asRelativePath(document),
			phrase,
			hits: [],
			pending: 0,
			searching: false,
			error: `Could not search this manuscript — ${why}`,
		});
	}

	private publish(results: Results | null): void {
		this.results = results;
		for (const listener of this.listeners) {
			listener(results);
		}
	}

	/**
	 * Ask the server to encode the manuscript.
	 *
	 * Nothing waits on it. It appears in the job list like every other long thing,
	 * and the search reports what is left to encode as it goes.
	 */
	private async reindex(document: vscode.Uri): Promise<void> {
		try {
			await fetch(`http://127.0.0.1:${this.port}/search/index`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: document.fsPath }),
			});
		} catch {
			// A server that is not running is worth saying when a search is asked
			// for, and the search itself is about to say it.
		}
	}

	dispose(): void {
		clearTimeout(this.retry);
		this.request?.abort();
		for (const item of this.disposables) {
			item.dispose();
		}
	}
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
