// Corrects the grammar of the passage the author is working on: the lines they
// have selected, or the section their cursor is in.
//
// What the request carries is what the author did — a selection, or a cursor.
// Where a section begins and ends is the server's to say, since it is the one
// that reads manuscripts. The server holds the model too, and writes the
// manuscript back, so the correction reaches the author as a change to the prose
// they are looking at. A pass runs the model for a while, so the POST only
// starts it and a status poll follows it to the end; the status bar says one is
// running and the Jobs Status drawer is where it is followed.

import * as vscode from 'vscode';

import type { ModelHealth } from './health';

/** How often to ask the server how a correction is getting on. */
const POLL_INTERVAL_MS = 1000;

export class GrammarFix implements vscode.Disposable {
	/**
	 * The request in flight per path, so a second ask can end the one before it.
	 * The abort stops our polling here; the server supersedes the older job on
	 * its own side, keyed by the file they both write.
	 */
	private readonly requests = new Map<string, AbortController>();

	constructor(
		private readonly port: number,
		private readonly status: ModelHealth
	) {}

	async fix(editor: vscode.TextEditor): Promise<void> {
		if (editor.document.uri.scheme !== 'file') {
			return;
		}

		const path = editor.document.uri.fsPath;
		this.requests.get(path)?.abort();

		const request = new AbortController();
		this.requests.set(path, request);
		this.status.setFixing(true);

		try {
			const started = await fetch(`http://127.0.0.1:${this.port}/fix/grammar`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path,
					line: editor.selection.active.line,
					selection: selectedLines(editor.selection),
				}),
				signal: request.signal,
			});
			if (!started.ok) {
				vscode.window.showWarningMessage(
					`Authorship could not fix the grammar: ${await detailOf(started)}`
				);
				return;
			}
			const { id } = (await started.json()) as { id: string };
			await this.followToEnd(id, request.signal);
		} catch (err) {
			// An abort is ours, and means a newer pass is already on it.
			if (!isAbort(err)) {
				vscode.window.showWarningMessage(
					`Authorship could not fix the grammar — is the model server running? (${describe(
						err
					)})`
				);
			}
		} finally {
			if (this.requests.get(path) === request) {
				this.requests.delete(path);
			}
			this.status.setFixing(this.requests.size > 0);
		}
	}

	/** Poll the job's status until it is no longer running. */
	private async followToEnd(id: string, signal: AbortSignal): Promise<void> {
		for (;;) {
			await delay(POLL_INTERVAL_MS, signal);

			const response = await fetch(
				`http://127.0.0.1:${this.port}/fix/grammar/status?id=${encodeURIComponent(id)}`,
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

	dispose(): void {
		for (const request of this.requests.values()) {
			request.abort();
		}
	}
}

/**
 * The lines the author selected, or null when they selected nothing and the
 * section around the cursor is what they mean.
 *
 * A selection that ends where a line begins does not reach into it: dragging
 * down the margin, or clicking a line number, leaves the cursor at the head of
 * the line after the last one the author picked out.
 */
function selectedLines(
	selection: vscode.Selection
): { start: number; end: number } | null {
	if (selection.isEmpty) {
		return null;
	}
	const reachesIn =
		selection.end.character > 0 || selection.end.line === selection.start.line;
	return {
		start: selection.start.line,
		end: reachesIn ? selection.end.line : selection.end.line - 1,
	};
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

/** Our own aborts — a newer pass taking over — read as AbortError. */
function isAbort(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
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
