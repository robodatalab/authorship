// Rebuilds a manuscript's story graph, when the author asks for it.
//
// The server does the reading and the writing: it is handed a path and writes
// the `.graph.yaml`, which reaches the viewer through the file watcher that was
// already there. A build runs the model for minutes, so the POST only starts it
// and returns; a status poll follows it to the end. Nothing here parses a graph
// or touches the panel.

import * as vscode from 'vscode';

import type { BuildActivity } from './activity';
import type { ModelHealth } from './health';

/** How often to ask the server how a build is getting on. */
const POLL_INTERVAL_MS = 2000;

export class GraphBuilder implements vscode.Disposable {
	private readonly subscriptions: vscode.Disposable[] = [];

	/**
	 * The request in flight per path, so a second ask can end the one before it.
	 * The abort stops our polling here; the server supersedes the older build on
	 * its own side.
	 */
	private readonly requests = new Map<string, AbortController>();

	constructor(
		private readonly port: number,
		status: ModelHealth,
		private readonly activity: BuildActivity
	) {
		// The bar follows the activity rather than being told separately, so there
		// is one answer to whether anything is building.
		const stop = this.activity.onChange(() => status.setBuilding(this.activity.any()));
		this.subscriptions.push({ dispose: stop });
	}

	async build(manuscript: vscode.Uri): Promise<void> {
		if (manuscript.scheme !== 'file') {
			return;
		}

		const path = manuscript.fsPath;
		this.requests.get(path)?.abort();

		const request = new AbortController();
		this.requests.set(path, request);
		const current = this.activity.started(path, Date.now());

		try {
			const started = await fetch(`http://127.0.0.1:${this.port}/build`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path }),
				signal: request.signal,
			});
			if (!started.ok) {
				await this.warn(started);
				return;
			}

			const { id } = (await started.json()) as { id: string };
			await this.followToEnd(id, request.signal);
		} catch (err) {
			// An abort is ours, and means a newer build is already on it.
			if (!isAbort(err)) {
				await this.warnAbout(err);
			}
		} finally {
			if (this.requests.get(path) === request) {
				this.requests.delete(path);
			}
			this.activity.finished(current);
		}
	}

	/** Poll the build's status until it is no longer running. */
	private async followToEnd(id: string, signal: AbortSignal): Promise<void> {
		for (;;) {
			await delay(POLL_INTERVAL_MS, signal);

			const response = await fetch(
				`http://127.0.0.1:${this.port}/build/status?id=${encodeURIComponent(id)}`,
				{ signal }
			);
			// A 404 means the server has no record of this build — it restarted,
			// say — so there is nothing left to wait for.
			if (!response.ok) {
				return;
			}

			const body = (await response.json()) as { running?: boolean };
			if (!body.running) {
				return; // done, or superseded by a newer save
			}
		}
	}

	private async warn(response: Response): Promise<void> {
		let detail = response.statusText;
		try {
			const body = (await response.json()) as { detail?: string };
			detail = body.detail ?? detail;
		} catch {
			// A non-JSON body; the status text will have to do.
		}
		vscode.window.showWarningMessage(
			`Authorship could not rebuild the story graph: ${detail}`
		);
	}

	/** A build was asked for, so a server that is not answering has to be said. */
	private async warnAbout(err: unknown): Promise<void> {
		const message = (err as { message?: unknown } | null)?.message;
		vscode.window.showWarningMessage(
			`Authorship could not rebuild the story graph — is the model server running? (${
				typeof message === 'string' ? message : String(err)
			})`
		);
	}

	dispose(): void {
		// Unsubscribing first: aborting sends the polls unwinding, and their
		// announcements would otherwise reach a status bar that is already gone.
		for (const item of this.subscriptions) {
			item.dispose();
		}
		for (const request of this.requests.values()) {
			request.abort();
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

/** Our own aborts — a newer save taking over — read as AbortError. */
function isAbort(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}
