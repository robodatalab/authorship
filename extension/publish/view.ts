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
	partWords: number;
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
	kind: string;
	path: string;
	status: string;
}

/** A passage, already turned into what a row says by the host. */
interface HitRow {
	label: string;
	where: string;
	text: string;
}

interface SearchMessage {
	manuscript: string;
	phrase: string;
	searching: boolean;
	error: string | null;
	/** What is left to encode, or empty once nothing is. */
	progress: string;
	hits: HitRow[];
}

interface Memory {
	gpu: { used: number; limit: number };
	process: number;
	machine: number;
	serving: string | null;
}

interface Sample {
	gpu: number;
	process: number;
	serving: string | null;
	at: number;
}

const vscode = acquireVsCodeApi();

const manuscriptName = document.getElementById('manuscript-name') as HTMLElement;
const chooseButton = document.getElementById('choose') as HTMLButtonElement;
const partWords = document.getElementById('f-part-words') as HTMLInputElement;
const divideButton = document.getElementById('divide') as HTMLButtonElement;
const mergeButton = document.getElementById('merge') as HTMLButtonElement;
const partsStatus = document.getElementById('parts-status') as HTMLElement;
const title = document.getElementById('f-title') as HTMLInputElement;
const author = document.getElementById('f-author') as HTMLInputElement;
const language = document.getElementById('f-language') as HTMLInputElement;
const coverName = document.getElementById('cover-name') as HTMLElement;
const chooseCover = document.getElementById('choose-cover') as HTMLButtonElement;
const clearCover = document.getElementById('clear-cover') as HTMLButtonElement;
const blurb = document.getElementById('f-blurb') as HTMLTextAreaElement;
const exportButton = document.getElementById('export') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLElement;
const searchPhrase = document.getElementById('search-phrase') as HTMLInputElement;
const searchClear = document.getElementById('search-clear') as HTMLButtonElement;
const searchNote = document.getElementById('search-note') as HTMLElement;
const searchHits = document.getElementById('search-hits') as HTMLElement;
const modelStatus = document.getElementById('model-status') as HTMLElement;
const memory = document.getElementById('memory') as HTMLElement;
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

partWords.addEventListener('change', () =>
	vscode.postMessage({ type: 'partWords', words: partWords.value })
);
divideButton.addEventListener('click', () => {
	setStatus(partsStatus, 'Dividing…', false);
	// The quota travels with the request rather than being read back from the
	// settings, so a click that lands before the field's own change has been
	// written still divides by the number the author is looking at.
	vscode.postMessage({ type: 'divide', words: partWords.value });
});
mergeButton.addEventListener('click', () => {
	setStatus(partsStatus, 'Merging…', false);
	vscode.postMessage({ type: 'merge' });
});

chooseButton.addEventListener('click', () => vscode.postMessage({ type: 'choose' }));
chooseCover.addEventListener('click', () => vscode.postMessage({ type: 'chooseCover' }));
clearCover.addEventListener('click', () => vscode.postMessage({ type: 'clearCover' }));
exportButton.addEventListener('click', () => {
	setStatus(status, 'Exporting…', false);
	vscode.postMessage({ type: 'export' });
});
// The phrase is asked on Enter rather than as it is typed: a search is a forward
// pass on the server, and half a phrase asks half a question.
searchPhrase.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') {
		vscode.postMessage({ type: 'search', phrase: searchPhrase.value });
	}
});
searchClear.addEventListener('click', () => {
	searchPhrase.value = '';
	vscode.postMessage({ type: 'clearSearch' });
});

/**
 * With no story chosen there is nothing to publish, so the form is inert.
 *
 * Search is deliberately not among them: it acts on whatever the cursor is in,
 * so a story having been chosen here says nothing about whether there is
 * anything for it to do.
 */
function setEnabled(enabled: boolean): void {
	const controls = [
		partWords,
		divideButton,
		mergeButton,
		title,
		author,
		language,
		chooseCover,
		clearCover,
		blurb,
		exportButton,
	];
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
	partWords.value = String(state.settings.partWords);
	title.value = state.settings.title;
	author.value = state.settings.author;
	language.value = state.settings.language;
	showCover(state.settings.cover);
	blurb.value = state.blurb;
	setEnabled(hasStory);
	setStatus(status, '', false);
	setStatus(partsStatus, '', false);
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

/** How many readings the plot keeps — at the poll interval, a few minutes' worth. */
const HISTORY = 120;

/**
 * The readings behind the plot. Which model was loaded is recorded alongside
 * each one rather than as its own timeline, so the bands drawn over the plot
 * cannot drift out of step with it.
 */
const samples: Sample[] = [];

/** null means the server did not answer; otherwise what the model is holding. */
function renderMemory(reading: Memory | null): void {
	memory.textContent = '';
	if (reading === null) {
		const offline = document.createElement('div');
		offline.className = 'offline';
		offline.textContent = 'Model server offline';
		memory.append(offline);
		return;
	}

	samples.push({
		gpu: reading.gpu.used,
		process: reading.process,
		serving: reading.serving,
		at: Date.now(),
	});
	if (samples.length > HISTORY) {
		samples.shift();
	}

	// The GPU's ceiling is the number a load has to fit under; the machine's RAM
	// is what the process is killed over. Each bar is read against its own.
	memory.append(
		gauge('GPU', reading.gpu.used, reading.gpu.limit),
		gauge('Process', reading.process, reading.machine),
		bands(samples),
		plot(samples, Math.max(reading.gpu.limit, reading.machine))
	);
}

/** A box per run of the same model, over the stretch of plot it was loaded for. */
function bands(history: Sample[]): HTMLElement {
	const strip = document.createElement('div');
	strip.className = 'bands';

	let start = 0;
	while (start < history.length) {
		const model = history[start].serving;
		let end = start;
		while (end + 1 < history.length && history[end + 1].serving === model) {
			end += 1;
		}
		if (model !== null) {
			const band = document.createElement('span');
			band.className = 'band';
			band.style.left = `${(start / (HISTORY - 1)) * 100}%`;
			band.style.width = `${((end - start) / (HISTORY - 1)) * 100}%`;
			band.textContent = shortName(model);
			band.title = `${model} — ${duration(
				history[end].at - history[start].at
			)} and counting`;
			strip.append(band);
		}
		start = end + 1;
	}
	return strip;
}

function shortName(model: string): string {
	return model.split('/').pop() ?? model;
}

/** Whole seconds under a minute, then minutes and seconds. */
function duration(milliseconds: number): string {
	const whole = Math.round(milliseconds / 1000);
	if (whole < 60) {
		return `${whole}s`;
	}
	return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

function gauge(label: string, used: number, of: number): HTMLElement {
	const row = document.createElement('div');
	row.className = 'gauge';

	const name = document.createElement('span');
	name.className = 'name';
	name.textContent = label;

	const track = document.createElement('span');
	track.className = 'track';
	const fill = document.createElement('span');
	const share = of > 0 ? used / of : 0;
	fill.className = share > 1 ? 'fill over' : 'fill';
	fill.style.width = `${Math.min(share, 1) * 100}%`;
	track.append(fill);

	const figure = document.createElement('span');
	figure.className = 'figure';
	figure.textContent = `${used.toFixed(1)} / ${of.toFixed(0)} GB`;

	row.append(name, track, figure);
	return row;
}

/**
 * The two histories over one scale, so the GPU's share of the machine reads at
 * a glance. Hand-drawn SVG: the view's policy admits no script but its own.
 */
function plot(history: Sample[], ceiling: number): SVGElement {
	const width = 240;
	const height = 48;
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('preserveAspectRatio', 'none');
	svg.classList.add('plot');

	const series = [
		['gpu', (sample: Sample) => sample.gpu],
		['process', (sample: Sample) => sample.process],
	] as const;

	for (const [name, read] of series) {
		if (history.length < 2) {
			continue;
		}
		const step = width / (HISTORY - 1);
		const points = history
			.map((sample, index) => {
				const x = index * step;
				const y = height - (ceiling > 0 ? read(sample) / ceiling : 0) * height;
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
		const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		line.setAttribute('points', points);
		line.classList.add(name);
		svg.append(line);
	}
	return svg;
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

		// What the job does, and where it is, on one line; the file it works on
		// beneath, where a long path has the width to read.
		const head = document.createElement('div');
		head.className = 'head';

		const kind = document.createElement('span');
		kind.className = 'kind';
		kind.textContent = job.kind;

		const phase = document.createElement('span');
		phase.className = `phase ${job.status}`;
		phase.textContent = job.status;

		head.append(kind, phase);

		const name = document.createElement('div');
		name.className = 'name';
		name.textContent = job.path;
		name.title = job.path;

		row.append(head, name);
		jobsStatus.append(row);
	}
}

/**
 * The search, or null once it has been put away.
 *
 * The rows say what the host decided they say; nothing here reads a passage or a
 * line number. A row carries its position, and clicking it asks the host to send
 * the cursor there — the host is what holds the manuscript and the highlights.
 */
function renderSearch(search: SearchMessage | null): void {
	searchHits.textContent = '';
	searchClear.hidden = search === null;

	if (search === null) {
		setStatus(searchNote, '', false);
		return;
	}

	if (search.error) {
		setStatus(searchNote, search.error, true);
	} else if (search.searching) {
		setStatus(searchNote, `Searching ${search.manuscript}…`, false);
	} else if (search.progress) {
		// An empty list reads as a manuscript that holds no answer, which is a
		// different thing from one the server has not finished reading.
		setStatus(searchNote, search.progress, false);
	} else if (search.hits.length === 0) {
		setStatus(searchNote, `Nothing in ${search.manuscript} answers that.`, false);
	} else {
		setStatus(searchNote, search.manuscript, false);
	}

	search.hits.forEach((hit, index) => {
		const row = document.createElement('button');
		row.type = 'button';
		row.className = 'hit';
		// The passage is cut to a row's width; the whole of it is worth having on
		// hover, since a line number alone says nothing about what is there.
		row.title = hit.text;
		row.addEventListener('click', () =>
			vscode.postMessage({ type: 'revealHit', index })
		);

		const passage = document.createElement('span');
		passage.className = 'passage';
		passage.textContent = hit.label;

		const where = document.createElement('span');
		where.className = 'where';
		where.textContent = hit.where;

		row.append(passage, where);
		searchHits.append(row);
	});
}

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'search') {
		renderSearch(message.search as SearchMessage | null);
	} else if (message?.type === 'state') {
		renderState(message as StateMessage);
	} else if (message?.type === 'cover') {
		showCover(String(message.cover ?? ''));
	} else if (message?.type === 'status') {
		setStatus(status, String(message.message ?? ''), Boolean(message.error));
	} else if (message?.type === 'partsStatus') {
		setStatus(partsStatus, String(message.message ?? ''), Boolean(message.error));
	} else if (message?.type === 'models') {
		renderModels(message.models as ModelStatus[] | null);
	} else if (message?.type === 'memory') {
		renderMemory(message.memory as Memory | null);
	} else if (message?.type === 'jobs') {
		renderJobs(message.jobs as JobStatus[] | null);
	}
});

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
vscode.postMessage({ type: 'ready' });
