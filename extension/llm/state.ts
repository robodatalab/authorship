// How the model server's state reads in the status bar.
//
// Free of the `vscode` module so the wording can be asserted directly.

/**
 * What `GET /health` reports, plus the case where nothing answers, plus what we
 * are doing to the server ourselves.
 *
 * `building` and `scoring` are the odd ones out: they are not states the server
 * publishes, they are requests of ours that are still in flight. `/health` stays
 * a statement about the model alone.
 */
export type Phase =
	| 'offline'
	| 'unloaded'
	| 'downloading'
	| 'ready'
	| 'building'
	| 'scoring';

export interface StatusDisplay {
	text: string;
	tooltip: string;
}

/**
 * Map the server's `inference_server_status` field onto a phase.
 *
 * The server reports `"unloaded"` before anything has asked for the model,
 * `"<model>: <n>% downloaded"` while it is fetching the weights, and `"serving"`
 * once the model is loaded and answering. The load onto the GPU is not a phase of
 * its own — the server stays on the last `"<n>% downloaded"` reading until it
 * flips to `"serving"`. Only a server that does not answer at all is offline.
 */
export function phaseFor(status: string | undefined): Phase {
	if (status === 'serving') {
		return 'ready';
	}
	if (status === 'unloaded') {
		return 'unloaded';
	}
	if (status !== undefined && /\d+% downloaded$/.test(status)) {
		return 'downloading';
	}
	return 'offline';
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
		case 'unloaded':
			return {
				text: '$(book) Authorship: idle',
				tooltip: 'The model server is up; the model loads on first use.',
			};
		case 'downloading':
			return {
				text: '$(book) Authorship: downloading',
				tooltip: 'Fetching the model. This takes a while on first run.',
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
		case 'scoring':
			return {
				text: '$(sync~spin) Authorship: scoring',
				tooltip: 'Weighing the lines of the section the cursor is in.',
			};
	}
}
