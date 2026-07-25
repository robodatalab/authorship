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

interface ModelStatus {
	model: string;
	status: string;
	resident: boolean;
}

interface JobStatus {
	path: string;
	status: string;
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
const fixGrammar = document.getElementById('fix-grammar') as HTMLButtonElement;
const utilsStatus = document.getElementById('utils-status') as HTMLElement;
const modelStatus = document.getElementById('model-status') as HTMLElement;
const jobsStatus = document.getElementById('jobs-status') as HTMLElement;

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
	setStatus(status, 'Exporting…', false);
	vscode.postMessage({ type: 'export' });
});
fixGrammar.addEventListener('click', () => {
	setStatus(utilsStatus, 'Fixing grammar…', false);
	vscode.postMessage({ type: 'fixGrammar' });
});

/** With no story chosen there is nothing to act on, so the panel is inert. */
function setEnabled(enabled: boolean): void {
	const controls = [title, author, language, chooseCover, clearCover, blurb, exportButton, fixGrammar];
	for (const el of controls) {
		el.disabled = !enabled;
	}
}

function setStatus(el: HTMLElement, message: string, error: boolean): void {
	el.textContent = message;
	el.classList.toggle('error', error);
	el.hidden = message === '';
}

function showCover(cover: string): void {
	coverName.textContent = cover ? baseName(cover) : 'None';
	clearCover.hidden = cover === '';
}

function renderState(state: StateMessage): void {
	const hasStory = state.manuscript !== null;
	manuscriptName.textContent = state.manuscript ?? 'No story selected';
	// The name is ellipsized when the path is long; the tooltip keeps it legible.
	manuscriptName.title = state.manuscript ?? '';
	title.value = state.settings.title;
	author.value = state.settings.author;
	language.value = state.settings.language;
	showCover(state.settings.cover);
	blurb.value = state.blurb;
	setEnabled(hasStory);
	setStatus(status, '', false);
	setStatus(utilsStatus, '', false);
}

function baseName(p: string): string {
	return p.split(/[\\/]/).pop() ?? p;
}

/** null means the server did not answer; a list is its models and which is resident. */
function renderModels(models: ModelStatus[] | null): void {
	modelStatus.textContent = '';
	if (models === null) {
		const offline = document.createElement('div');
		offline.className = 'offline';
		offline.textContent = 'Model server offline';
		modelStatus.append(offline);
		return;
	}
	for (const m of models) {
		const row = document.createElement('div');
		row.className = m.resident ? 'model resident' : 'model';

		const name = document.createElement('span');
		name.className = 'name';
		name.textContent = m.model;
		name.title = m.model;

		const phase = document.createElement('span');
		phase.className = `phase ${phaseClass(m.status)}`;
		phase.textContent = phaseText(m.status);

		row.append(name, phase);
		modelStatus.append(row);
	}
}

/** The server prefixes the model id onto its download progress; drop it here. */
function phaseText(status: string): string {
	const progress = status.match(/\d+% downloaded/);
	return progress ? progress[0] : status;
}

function phaseClass(status: string): string {
	if (status === 'serving') {
		return 'serving';
	}
	if (status.includes('downloaded')) {
		return 'downloading';
	}
	return 'unloaded';
}

/** null means the server did not answer; a list is the work it has in hand. */
function renderJobs(jobs: JobStatus[] | null): void {
	jobsStatus.textContent = '';
	if (jobs === null) {
		const offline = document.createElement('div');
		offline.className = 'offline';
		offline.textContent = 'Model server offline';
		jobsStatus.append(offline);
		return;
	}
	if (jobs.length === 0) {
		const idle = document.createElement('div');
		idle.className = 'idle';
		idle.textContent = 'Nothing queued';
		jobsStatus.append(idle);
		return;
	}
	for (const job of jobs) {
		const row = document.createElement('div');
		row.className = 'job';

		const name = document.createElement('span');
		name.className = 'name';
		name.textContent = job.path;
		name.title = job.path;

		const phase = document.createElement('span');
		phase.className = `phase ${job.status}`;
		phase.textContent = job.status;

		row.append(name, phase);
		jobsStatus.append(row);
	}
}

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'state') {
		renderState(message as StateMessage);
	} else if (message?.type === 'cover') {
		showCover(String(message.cover ?? ''));
	} else if (message?.type === 'status') {
		const target = message.scope === 'utils' ? utilsStatus : status;
		setStatus(target, String(message.message ?? ''), Boolean(message.error));
	} else if (message?.type === 'models') {
		renderModels(message.models as ModelStatus[] | null);
	} else if (message?.type === 'jobs') {
		renderJobs(message.jobs as JobStatus[] | null);
	}
});

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
vscode.postMessage({ type: 'ready' });
