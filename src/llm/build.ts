// Rebuilds a manuscript's story graph when the manuscript is saved.
//
// The server does the reading and the writing: it is handed a path, and the
// `.graph.yaml` it writes reaches the viewer through the file watcher that was
// already there. Nothing here parses a graph or touches the panel.

import * as vscode from 'vscode';

import type { ModelHealth } from './health';

/** A build runs the model over the whole manuscript, so minutes, not seconds. */
const REQUEST_TIMEOUT_MS = 600_000;

export class GraphBuilder implements vscode.Disposable {
	private readonly subscription: vscode.Disposable;

	/**
	 * Paths with a build in flight.
	 *
	 * Saving twice in quick succession would otherwise put two writers on one
	 * file, and the first to finish would clear the status bar while the second
	 * was still running.
	 */
	private readonly running = new Set<string>();

	constructor(
		private readonly port: number,
		private readonly status: ModelHealth
	) {
		this.subscription = vscode.workspace.onDidSaveTextDocument((document) =>
			void this.build(document)
		);
	}

	private async build(document: vscode.TextDocument): Promise<void> {
		if (document.languageId !== 'markdown' || document.uri.scheme !== 'file') {
			return;
		}

		const path = document.uri.fsPath;
		if (this.running.has(path)) {
			return;
		}

		this.running.add(path);
		this.status.setBuilding(true);
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/build`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path }),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			if (!response.ok) {
				const body = (await response.json()) as { detail?: string };
				vscode.window.showWarningMessage(
					`Authorship could not rebuild the story graph: ${body.detail ?? response.statusText}`
				);
			}
		} catch (err) {
			// Saving is not an act of asking for this, so a server that is simply
			// not running must not interrupt. The status bar already says offline.
			console.error('Authorship: story graph build failed', err);
		} finally {
			this.running.delete(path);
			this.status.setBuilding(this.running.size > 0);
		}
	}

	dispose(): void {
		this.subscription.dispose();
	}
}
