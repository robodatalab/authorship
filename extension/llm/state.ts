// How the model server's state reads in the status bar.
//
// Free of the `vscode` module so the wording can be asserted directly.

/**
 * What `GET /health` reports, plus the case where nothing answers, plus what we
 * are doing to the server ourselves.
 *
 * `building` is the odd one out: it is not a state the server publishes, it is
 * a request of ours that is still in flight. `/health` stays a statement about
 * the model alone.
 */
export type Phase = 'offline' | 'downloading' | 'loading' | 'ready' | 'building';

export interface StatusDisplay {
	text: string;
	tooltip: string;
}

/**
 * Map the server's `status` field onto a phase.
 *
 * `starting` and `loading` are separate on the server — one is the worker
 * process coming up, the other is the weights going to the GPU — but they read
 * the same from here: not usable yet, and nothing to do but wait.
 */
export function phaseFor(status: string | undefined): Phase {
	switch (status) {
		case 'ready':
			return 'ready';
		case 'downloading':
			return 'downloading';
		case 'starting':
		case 'loading':
			return 'loading';
		default:
			return 'offline';
	}
}

/**
 * The bar reports the extension's state, not the model's — the model is an
 * implementation detail, so a working extension reads simply as `ok`. Only the
 * states where Authorship cannot do its job name what is holding it up.
 */
export function renderStatus(phase: Phase): StatusDisplay {
	switch (phase) {
		case 'offline':
			return {
				text: '$(book) Authorship: offline',
				tooltip: 'No model server is answering. Start it from the debugger.',
			};
		case 'downloading':
			return {
				text: '$(book) Authorship: downloading',
				tooltip: 'Fetching the model. This takes a while on first run.',
			};
		case 'loading':
			return {
				text: '$(book) Authorship: loading',
				tooltip: 'Loading the model onto the GPU.',
			};
		case 'ready':
			return {
				text: '$(book) Authorship: ok',
				tooltip: 'The model is loaded and serving.',
			};
		case 'building':
			return {
				text: '$(sync~spin) Authorship: building',
				tooltip: 'Reading the manuscript.',
			};
	}
}
