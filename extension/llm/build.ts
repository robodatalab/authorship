// Rebuilds a manuscript's story graph when the manuscript is saved.
//
// The server does the reading and the writing: it is handed a path, and the
// `.graph.yaml` it writes reaches the viewer through the file watcher that was
// already there. Nothing here parses a graph or touches the panel.

import * as vscode from 'vscode';

import type { BuildActivity } from './activity';
import type { ModelHealth } from './health';

/** A build runs the model over the whole manuscript, so minutes, not seconds. */
const REQUEST_TIMEOUT_MS = 600_000;

/**
 * The server saying a newer save took the manuscript over. Not a failure: it is
 * the answer to having saved again, and the newer build is already running.
 */
const SUPERSEDED = 409;

export class GraphBuilder implements vscode.Disposable {
	private readonly subscriptions: vscode.Disposable[] = [];

	/**
	 * The request in flight per path, so a save can end the one before it.
	 *
	 * Two writers on one file is the thing being avoided, and waiting is the
	 * lesser half of it: the older build was reading a draft that no longer
	 * exists, so its answer would overwrite the newer one if it happened to
	 * finish second.
	 */
	private readonly requests = new Map<string, AbortController>();

	constructor(
		private readonly port: number,
		status: ModelHealth,
		private readonly activity: BuildActivity
	) {
		this.subscriptions.push(
			vscode.workspace.onDidSaveTextDocument((document) => void this.build(document))
		);

		// The bar follows the activity rather than being told separately, so there
		// is one answer to whether anything is building.
		const stop = this.activity.onChange(() => status.setBuilding(this.activity.any()));
		this.subscriptions.push({ dispose: stop });
	}

	private async build(document: vscode.TextDocument): Promise<void> {
		if (document.languageId !== 'markdown' || document.uri.scheme !== 'file') {
			return;
		}

		const path = document.uri.fsPath;
		this.requests.get(path)?.abort();

		const request = new AbortController();
		this.requests.set(path, request);
		const current = this.activity.started(path, Date.now());

		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/build`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path }),
				signal: AbortSignal.any([
					request.signal,
					AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				]),
			});
			if (!response.ok && response.status !== SUPERSEDED) {
				const body = (await response.json()) as { detail?: string };
				vscode.window.showWarningMessage(
					`Authorship could not rebuild the story graph: ${body.detail ?? response.statusText}`
				);
			}
		} catch (err) {
			// Saving is not an act of asking for this, so a server that is simply
			// not running must not interrupt. The status bar already says offline.
			// An abort is ours, and means the newer save is already on it.
			if (!isAbort(err)) {
				console.error('Authorship: story graph build failed', err);
			}
		} finally {
			if (this.requests.get(path) === request) {
				this.requests.delete(path);
			}
			this.activity.finished(current);
		}
	}

	dispose(): void {
		// Unsubscribing first: aborting sends the builds unwinding, and their
		// announcements would otherwise reach a status bar that is already gone.
		for (const item of this.subscriptions) {
			item.dispose();
		}
		for (const request of this.requests.values()) {
			request.abort();
		}
	}
}

/** A timeout aborts too, but that one is worth saying out loud. */
function isAbort(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}
