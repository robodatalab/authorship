// Watches the model server and mirrors what it reports into the status bar.
//
// The extension does not start the server — the launch configuration does — so
// this only ever observes. Reporting anything the server did not say is how the
// bar came to claim the model was off while it was downloading.

import * as vscode from 'vscode';

import { phaseFor, renderStatus, type Phase } from './state';

const POLL_INTERVAL_MS = 2_000;

/** Generous, because loading the weights starves the event loop for seconds. */
const REQUEST_TIMEOUT_MS = 10_000;

export class ModelHealth implements vscode.Disposable {
	private readonly status: vscode.StatusBarItem;
	private readonly timer: NodeJS.Timeout;
	private phase: Phase = 'offline';
	private building = false;
	private scoring = false;

	constructor(private readonly port: number) {
		this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.render();
		this.status.show();

		void this.poll();
		this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
	}

	private async poll(): Promise<void> {
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/health`, {
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			const body = (await response.json()) as { inference_server_status?: string };
			this.phase = phaseFor(body.inference_server_status);
		} catch (err) {
			// A timeout means the server is there but too busy to answer — loading
			// weights starves the event loop. Only a refused connection means it is
			// actually gone; reporting a slow reply as `offline` made the bar flicker
			// between downloading and offline for the whole load.
			if (!isTimeout(err)) {
				this.phase = 'offline';
			}
		}
		this.render();
	}

	/**
	 * Say whether a graph build is in flight.
	 *
	 * Polling carries on underneath and keeps `phase` current, so whatever the
	 * server has become is already showing the moment the build ends.
	 */
	setBuilding(building: boolean): void {
		this.building = building;
		this.render();
	}

	/** Say whether a section is being scored — seconds, not the minutes a build takes. */
	setScoring(scoring: boolean): void {
		this.scoring = scoring;
		this.render();
	}

	private render(): void {
		// Our own requests outrank the health phases: they can only have started
		// from `ready`, and they are the more specific thing to say. A build
		// outranks a scoring in turn, being the one that runs for minutes.
		const display = renderStatus(this.current());
		this.status.text = display.text;
		this.status.tooltip = display.tooltip;
	}

	private current(): Phase {
		if (this.building) {
			return 'building';
		}
		return this.scoring ? 'scoring' : this.phase;
	}

	dispose(): void {
		clearInterval(this.timer);
		this.status.dispose();
	}
}

/** `AbortSignal.timeout` rejects with a `TimeoutError`; a refused connection does not. */
function isTimeout(err: unknown): boolean {
	return err instanceof Error && err.name === 'TimeoutError';
}
