// The Publish form, running inside the webview. Everything here is DOM and the
// message channel; the files it drives live host-side in publish/panel.ts.
//
// The host owns the truth. The form only reports edits and repaints itself from
// what the host sends back — so free-text fields report on `change` (once the
// value has settled), and the blurb also settles on a short debounce as it is
// typed.

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface PubSettings {
	title: string;
	author: string;
	language: string;
	cover: string;
}

interface StateMessage {
	manuscript: string | null;
	settings: PubSettings;
	blurb: string;
}

const vscode = acquireVsCodeApi();

const manuscriptName = document.getElementById('manuscript-name') as HTMLElement;
const chooseButton = document.getElementById('choose') as HTMLButtonElement;
const title = document.getElementById('f-title') as HTMLInputElement;
const author = document.getElementById('f-author') as HTMLInputElement;
const language = document.getElementById('f-language') as HTMLInputElement;
const coverName = document.getElementById('cover-name') as HTMLElement;
const chooseCover = document.getElementById('choose-cover') as HTMLButtonElement;
const clearCover = document.getElementById('clear-cover') as HTMLButtonElement;
const blurb = document.getElementById('f-blurb') as HTMLTextAreaElement;
const exportButton = document.getElementById('export') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLElement;

/** How long after the last keystroke the blurb is written. */
const BLURB_DEBOUNCE_MS = 400;

function sendSettings(): void {
	vscode.postMessage({
		type: 'settings',
		settings: { title: title.value, author: author.value, language: language.value },
	});
}

for (const field of [title, author, language]) {
	field.addEventListener('change', sendSettings);
}

let blurbTimer: ReturnType<typeof setTimeout> | undefined;

function commitBlurb(): void {
	if (blurbTimer !== undefined) {
		clearTimeout(blurbTimer);
		blurbTimer = undefined;
	}
	vscode.postMessage({ type: 'blurb', text: blurb.value });
}

blurb.addEventListener('input', () => {
	if (blurbTimer !== undefined) {
		clearTimeout(blurbTimer);
	}
	blurbTimer = setTimeout(commitBlurb, BLURB_DEBOUNCE_MS);
});
// Leaving the field shouldn't wait out the debounce.
blurb.addEventListener('change', commitBlurb);

chooseButton.addEventListener('click', () => vscode.postMessage({ type: 'choose' }));
chooseCover.addEventListener('click', () => vscode.postMessage({ type: 'chooseCover' }));
clearCover.addEventListener('click', () => vscode.postMessage({ type: 'clearCover' }));
exportButton.addEventListener('click', () => {
	setStatus('Exporting…', false);
	vscode.postMessage({ type: 'export' });
});

/** With no manuscript there is nothing to configure, so the form is inert. */
function setEnabled(enabled: boolean): void {
	for (const el of [title, author, language, chooseCover, clearCover, blurb, exportButton]) {
		el.disabled = !enabled;
	}
}

function setStatus(message: string, error: boolean): void {
	status.textContent = message;
	status.classList.toggle('error', error);
	status.hidden = message === '';
}

function showCover(cover: string): void {
	coverName.textContent = cover ? baseName(cover) : 'None';
	clearCover.hidden = cover === '';
}

function renderState(state: StateMessage): void {
	const hasManuscript = state.manuscript !== null;
	manuscriptName.textContent = state.manuscript ?? 'No manuscript selected';
	title.value = state.settings.title;
	author.value = state.settings.author;
	language.value = state.settings.language;
	showCover(state.settings.cover);
	blurb.value = state.blurb;
	setEnabled(hasManuscript);
	setStatus('', false);
}

function baseName(p: string): string {
	return p.split(/[\\/]/).pop() ?? p;
}

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'state') {
		renderState(message as StateMessage);
	} else if (message?.type === 'cover') {
		showCover(String(message.cover ?? ''));
	} else if (message?.type === 'status') {
		setStatus(String(message.message ?? ''), Boolean(message.error));
	}
});

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
vscode.postMessage({ type: 'ready' });
