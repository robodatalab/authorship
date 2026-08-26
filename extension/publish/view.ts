// The Authorship sidebar, running inside the webview. Everything here is DOM and
// the message channel; the polling that feeds it lives host-side in
// publish/panel.ts.
//
// Three readings and nothing to fill in: what is loaded, what it is holding, and
// what work is queued. The book itself is edited in the .author editor.
//
// Above them, the one thing here that is not a reading: whether there is a Gemini
// account, and the button that makes one. Everything else Authorship can reach
// runs on this machine and needs no account, so the drawer that lists what it can
// reach is where a person goes looking for the one that does.

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface ModelStatus {
	model: string;
	status: string;
	resident: boolean;
}

interface JobStatus {
	kind: string;
	/** What the server keys the job by, and what stopping it names. */
	path: string;
	/** The same file, said short enough for the panel. */
	name: string;
	status: string;
	cancelled: boolean;
}

/** The Gemini account as the drawer draws it. */
interface Account {
	/** The key's masked tail, or null when nobody is signed in. */
	label: string | null;
	/** The model in force; empty is whichever one Authorship ships with. */
	model: string;
	/** What that one is called, so the default option can name it. */
	shipped: string;
	models: { model: string; label: string; detail: string }[];
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

const account = document.getElementById('account') as HTMLElement;
const modelStatus = document.getElementById('model-status') as HTMLElement;
const memory = document.getElementById('memory') as HTMLElement;
const jobsStatus = document.getElementById('jobs-status') as HTMLElement;

/**
 * The Gemini account, the model it will use, and the way in or out.
 *
 * `null` is signed out, which is the state this starts in and the state most
 * authors will stay in — so it says what the account is *for* rather than only
 * that there isn't one. Signed in, the model matters as much as the key does:
 * Google retires names and keeps the best models off the free tier, so which
 * one this is pointed at is a thing that goes wrong and has to be visible.
 */
function renderAccount(state: Account): void {
	account.textContent = '';
	const { label } = state;

	const row = document.createElement('div');
	row.className = label ? 'account-row signed-in' : 'account-row';

	const name = document.createElement('span');
	name.className = 'name';
	name.textContent = 'Google Gemini';

	const said = document.createElement('span');
	said.className = 'phase';
	said.textContent = label ?? 'signed out';
	said.title = label
		? 'Signed in. Fixing style and grammar will use this key.'
		: 'Fixing style and grammar needs a Gemini API key.';

	row.append(name, said);

	const why = document.createElement('div');
	why.className = 'why';
	why.textContent = label
		? 'Fixing style and grammar sends chapters to Google. Everything else runs on this machine.'
		: 'Only needed to fix style and grammar, which is the one tool that does not run on this machine.';

	const action = document.createElement('button');
	action.type = 'button';
	action.className = 'account-action';
	action.textContent = label ? 'Sign out' : 'Sign in';
	action.addEventListener('click', () =>
		vscode.postMessage({ type: label ? 'signOutGemini' : 'signInGemini' })
	);

	account.append(row, why);
	if (label) {
		account.append(modelChoice(state));
	}
	account.append(action);
}

/**
 * Which Gemini corrects the chapters, as a list of the ones this key can reach.
 *
 * The list comes from Google when the account is looked at, so it is what the
 * key can actually use today rather than anything written into this extension —
 * which is the part that kept going stale.
 *
 * The chosen model is always among the options even when the list does not have
 * it: a name typed into settings by hand, or a list that could not be fetched,
 * still has to be shown, because a dropdown displaying something other than what
 * is in force is worse than no dropdown at all.
 */
function modelChoice(state: Account): HTMLElement {
	const holder = document.createElement('div');
	holder.className = 'account-model';

	const label = document.createElement('label');
	label.className = 'account-model-label';
	label.textContent = 'Model';
	label.htmlFor = 'gemini-model';

	const choose = document.createElement('select');
	choose.className = 'account-model-select';
	choose.id = 'gemini-model';

	const shipped = document.createElement('option');
	shipped.value = '';
	shipped.textContent = state.shipped
		? `Default (${state.shipped})`
		: 'Default';
	choose.append(shipped);

	const offered = state.models.map((one) => one.model);
	// A name in force that Google did not list — typed by hand, retired, or the
	// list never arrived. Shown first among the rest so it is not silently lost.
	if (state.model && !offered.includes(state.model)) {
		const stray = document.createElement('option');
		stray.value = state.model;
		stray.textContent = `${state.model} (not listed for this key)`;
		choose.append(stray);
	}
	for (const one of state.models) {
		const option = document.createElement('option');
		option.value = one.model;
		option.textContent = one.model;
		option.title = one.detail || one.label;
		choose.append(option);
	}
	choose.value = state.model;
	choose.addEventListener('change', () =>
		vscode.postMessage({ type: 'setGeminiModel', model: choose.value })
	);

	holder.append(label, choose);

	// The list is fetched when the account is looked at, so a model added since
	// then — or one that was not there because the server was still starting —
	// needs a way to be asked for again that is not signing out and back in.
	const again = document.createElement('button');
	again.type = 'button';
	again.className = 'account-refresh';
	again.title = 'Ask Gemini for the list of models again';
	again.textContent = '\u21bb';
	again.addEventListener('click', () =>
		vscode.postMessage({ type: 'refreshGeminiModels' })
	);
	holder.append(again);

	if (state.models.length === 0) {
		const none = document.createElement('div');
		none.className = 'why';
		none.textContent =
			'Could not list the models for this key. The default is still used.';
		holder.append(none);
	}
	return holder;
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

		// A job stops between the pieces of work it is made of, so on a long one
		// there is a stretch where it has been told and is still going. Saying so
		// is the difference between a slow button and a broken one.
		const phase = document.createElement('span');
		phase.className = `phase ${job.cancelled ? 'stopping' : job.status}`;
		phase.textContent = job.cancelled ? 'stopping' : job.status;

		head.append(kind, phase);

		// Only a job nobody has stopped yet: pressing it twice asks the server
		// for something it is already doing.
		if (!job.cancelled) {
			const stop = document.createElement('button');
			stop.type = 'button';
			stop.className = 'stop';
			stop.title = `Stop this ${job.kind}`;
			stop.append(document.createElement('i'));
			stop.addEventListener('click', () =>
				vscode.postMessage({ type: 'stopJob', path: job.path })
			);
			head.append(stop);
		}

		const name = document.createElement('div');
		name.className = 'name';
		name.textContent = job.name;
		name.title = job.name;

		row.append(head, name);
		jobsStatus.append(row);
	}
}

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'account') {
		renderAccount({
			label: message.account as string | null,
			model: (message.model as string) ?? '',
			shipped: (message.shipped as string) ?? '',
			models: (message.models as Account['models']) ?? [],
		});
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
