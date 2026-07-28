// The Authorship sidebar: a single webview view in the Authorship container,
// laid out as drawers. Story picks the manuscript every other drawer works on;
// Publishing sets its publication and exports an EPUB beside it; Utils runs
// one-shot fixes over it, starting with a grammar pass.
//
// The publication settings live in `<name>.pub.yaml` and the blurb in
// `<name>.blurb.md`, both sitting next to the manuscript exactly as
// `<name>.graph.yaml` does. This module owns those files; the webview is only
// the form. Exporting hands the manuscript and its settings to the server, which
// writes `<name>.epub` and is the one place that knows how to build the book.
// The grammar pass likewise runs on the server, which holds the model, and comes
// back as text the editor applies — so a correction can be reviewed and undone.

import * as vscode from 'vscode';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { progress, rowDescription, rowLabel } from '../search/model';
import type { ManuscriptSearch, Results } from '../search/results';
import {
	DEFAULT_SETTINGS,
	blurbPathFor,
	pubPathFor,
	readFields,
	type PubSettings,
} from './model';

/** Where the chosen manuscript is remembered between sessions. */
const MANUSCRIPT_KEY = 'authorship.publish.manuscript';

/** How often the status drawers refresh. */
const STATUS_POLL_MS = 1500;

/** Generous, because loading weights starves the event loop for seconds. */
const STATUS_REQUEST_TIMEOUT_MS = 10_000;

/** How often a running grammar job is polled for its result. */
const GRAMMAR_POLL_MS = 1000;

export class PublishView implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	/** The manuscript being published, if one has been chosen. */
	private manuscript?: vscode.Uri;

	/** Refreshes the status drawers while the view is alive. */
	private pollTimer?: ReturnType<typeof setInterval>;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly port: number,
		private readonly search: ManuscriptSearch
	) {
		// Pick up where we left off, or fall back to whatever markdown is open, so
		// the panel has something to publish the first time it is shown.
		const remembered = context.workspaceState.get<string>(MANUSCRIPT_KEY);
		this.manuscript = remembered
			? vscode.Uri.file(remembered)
			: activeMarkdown();
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
				vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
			],
		};
		view.webview.html = this.html(view.webview);

		view.webview.onDidReceiveMessage((message) => {
			switch (message?.type) {
				case 'ready':
					void this.send();
					// A search made before the view was ever shown, or before it was
					// hidden and brought back, is still the search in force.
					this.sendSearch(this.search.current());
					break;
				case 'choose':
					void this.choose();
					break;
				case 'chooseCover':
					void this.chooseCover();
					break;
				case 'clearCover':
					void this.setCover('');
					break;
				case 'settings':
					void this.writeSettings(readFields(message.settings));
					break;
				case 'blurb':
					void this.saveBlurb(String(message.text ?? ''));
					break;
				case 'export':
					void this.export();
					break;
				case 'fixGrammar':
					void this.fixGrammar();
					break;
				case 'buildRepresentations':
					void this.buildRepresentations();
					break;
				case 'sectionAttribution':
					void this.sectionAttribution();
					break;
				case 'search':
					void this.search.search(String(message.phrase ?? ''));
					break;
				case 'revealHit':
					void this.search.reveal(Number(message.index));
					break;
				case 'clearSearch':
					this.search.clear();
					break;
			}
		});

		void this.poll();
		this.pollTimer = setInterval(() => void this.poll(), STATUS_POLL_MS);

		// The search is owned elsewhere and moves on its own — an indexing pass
		// finishing, an edit shifting the passages — so the drawer follows it
		// rather than asking.
		const following = this.search.onChange((results) => this.sendSearch(results));

		view.onDidDispose(() => {
			if (this.pollTimer !== undefined) {
				clearInterval(this.pollTimer);
				this.pollTimer = undefined;
			}
			following.dispose();
			this.view = undefined;
		});
	}

	// --- manuscript selection ---

	/**
	 * Take the manuscript being edited, and only fall back to the file dialog
	 * when there is nothing to take — the story the author means is nearly
	 * always the one they are looking at.
	 */
	private async choose(): Promise<void> {
		const chosen = activeMarkdown() ?? (await pickMarkdown());
		if (!chosen) {
			return;
		}
		this.manuscript = chosen;
		await this.context.workspaceState.update(MANUSCRIPT_KEY, this.manuscript.fsPath);
		// A blurb the panel can display from the moment a manuscript is chosen.
		await this.ensureBlurb();
		await this.send();
	}

	private async chooseCover(): Promise<void> {
		const picked = await vscode.window.showOpenDialog({
			canSelectMany: false,
			openLabel: 'Use as cover',
			filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
		});
		if (!picked || picked.length === 0) {
			return;
		}
		await this.setCover(picked[0].fsPath);
	}

	// --- settings (<name>.pub.yaml) ---

	private async readSettings(): Promise<PubSettings> {
		if (!this.manuscript) {
			return { ...DEFAULT_SETTINGS };
		}
		try {
			const bytes = await vscode.workspace.fs.readFile(pubUriFor(this.manuscript));
			const parsed = parseYaml(new TextDecoder().decode(bytes)) as Partial<PubSettings> | null;
			return { ...DEFAULT_SETTINGS, ...(parsed ?? {}) };
		} catch {
			// No file yet, or an unreadable one — start from the defaults either way.
			return { ...DEFAULT_SETTINGS };
		}
	}

	/** Merge a change into `<name>.pub.yaml`, creating it on first edit. */
	private async writeSettings(patch: Partial<PubSettings>): Promise<void> {
		if (!this.manuscript) {
			return;
		}
		const merged = { ...(await this.readSettings()), ...patch };
		const text = stringifyYaml(merged, { lineWidth: 0 });
		await vscode.workspace.fs.writeFile(
			pubUriFor(this.manuscript),
			new TextEncoder().encode(text)
		);
	}

	/**
	 * Set the cover and tell the view — but only about the cover. A full state
	 * push would overwrite whatever the author is mid-way through typing in the
	 * blurb, so the cover carries on its own narrow message.
	 */
	private async setCover(cover: string): Promise<void> {
		await this.writeSettings({ cover });
		void this.view?.webview.postMessage({ type: 'cover', cover });
	}

	// --- blurb (<name>.blurb.md) ---

	private async readBlurb(): Promise<string> {
		if (!this.manuscript) {
			return '';
		}
		try {
			const bytes = await vscode.workspace.fs.readFile(blurbUriFor(this.manuscript));
			return new TextDecoder().decode(bytes);
		} catch {
			return '';
		}
	}

	private async ensureBlurb(): Promise<void> {
		if (!this.manuscript) {
			return;
		}
		const uri = blurbUriFor(this.manuscript);
		try {
			await vscode.workspace.fs.stat(uri);
		} catch {
			await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(''));
		}
	}

	private async saveBlurb(text: string): Promise<void> {
		if (!this.manuscript) {
			return;
		}
		await vscode.workspace.fs.writeFile(
			blurbUriFor(this.manuscript),
			new TextEncoder().encode(text)
		);
	}

	// --- export ---

	private async export(): Promise<void> {
		if (!this.manuscript) {
			return;
		}
		const settings = await this.readSettings();
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/export/epub`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: this.manuscript.fsPath,
					title: settings.title || null,
					author: settings.author,
					language: settings.language || 'en',
					cover: settings.cover || null,
				}),
			});
			if (!response.ok) {
				await this.status(`Export failed: ${await detailOf(response)}`, true);
				return;
			}
			const { path } = (await response.json()) as { path: string };
			// The file lands beside the manuscript and shows up in the explorer on
			// its own; opening a Finder window on top of that is just noise.
			await this.status(`Exported ${basename(vscode.Uri.file(path))}`, false);
		} catch (err) {
			// The server is what builds the book; a refused connection is the likely
			// cause, and it is the one thing the author can act on.
			await this.status(
				`Export failed — is the model server running? (${describe(err)})`,
				true
			);
		}
	}

	// --- utils: representations ---

	/**
	 * Hand the manuscript to the builder, which owns the request and reports it
	 * to the status bar. The build outlives this call by minutes; the Jobs Status
	 * drawer is where it is followed.
	 */
	private async buildRepresentations(): Promise<void> {
		if (!this.manuscript) {
			return;
		}
		await vscode.commands.executeCommand(
			'authorship.buildRepresentations',
			this.manuscript
		);
	}

	// --- utils: section attribution ---

	/**
	 * Score the section the cursor is in, adding it to the scores already held
	 * beside the manuscript.
	 *
	 * Alone among the Utils buttons this does not act on the chosen manuscript:
	 * it scores whichever section the cursor is sitting in. It reports nothing
	 * here either — the status bar says the scoring is running, and the column
	 * beside the prose is the result.
	 */
	private async sectionAttribution(): Promise<void> {
		await vscode.commands.executeCommand('authorship.scoreSection');
	}

	// --- search ---

	/**
	 * Hand the drawer the search as it stands.
	 *
	 * The rows are built here rather than in the view: what a row says about a
	 * passage is the same question whichever way it is displayed, and it is
	 * answered in search/model.ts where it can be read without a webview.
	 */
	private sendSearch(results: Results | null): void {
		void this.view?.webview.postMessage({
			type: 'search',
			search: results && {
				manuscript: results.manuscript,
				phrase: results.phrase,
				searching: results.searching,
				error: results.error,
				progress: progress(results.pending),
				hits: results.hits.map((hit) => ({
					label: rowLabel(hit),
					where: rowDescription(hit),
					text: hit.text,
				})),
			},
		});
	}

	// --- utils: grammar ---

	/**
	 * Correct the manuscript's grammar. The server holds the model and returns
	 * the corrected text; the editor applies it, so the author sees the change as
	 * an ordinary edit they can read over and undo, rather than a silent rewrite
	 * of the file on disk.
	 */
	private async fixGrammar(): Promise<void> {
		if (!this.manuscript) {
			return;
		}
		try {
			const started = await fetch(`http://127.0.0.1:${this.port}/fix/grammar`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: this.manuscript.fsPath }),
			});
			if (!started.ok) {
				await this.status(`Grammar fix failed: ${await detailOf(started)}`, true, 'utils');
				return;
			}
			const { id } = (await started.json()) as { id: string };
			await this.followGrammar(id);
			await this.status('Grammar fixed.', false, 'utils');
		} catch (err) {
			// The server is what holds the model; a refused connection is the likely
			// cause, and it is the one thing the author can act on.
			await this.status(
				`Grammar fix failed — is the model server running? (${describe(err)})`,
				true,
				'utils'
			);
		}
	}

	/** Wait out a grammar job. The manuscript itself is the result. */
	private async followGrammar(id: string): Promise<void> {
		for (;;) {
			await delay(GRAMMAR_POLL_MS);
			const response = await fetch(
				`http://127.0.0.1:${this.port}/fix/grammar/status?id=${encodeURIComponent(id)}`
			);
			if (!response.ok) {
				throw new Error(await detailOf(response));
			}
			const body = (await response.json()) as {
				running: boolean;
				error: string | null;
			};
			if (body.error) {
				throw new Error(body.error);
			}
			if (!body.running) {
				return;
			}
		}
	}

	// --- view plumbing ---

	/** Read the files and hand the whole state to the view. */
	private async send(): Promise<void> {
		if (!this.view) {
			return;
		}
		await this.view.webview.postMessage({
			type: 'state',
			// Shown root-relative, so a story nested in the workspace reads as its
			// path rather than a bare filename shared with every other story.md.
			manuscript: this.manuscript
				? vscode.workspace.asRelativePath(this.manuscript)
				: null,
			settings: await this.readSettings(),
			blurb: await this.readBlurb(),
		});
	}

	/** A status line, sent to whichever drawer raised it. */
	private async status(
		message: string,
		error: boolean,
		scope: 'publish' | 'utils' = 'publish'
	): Promise<void> {
		await this.view?.webview.postMessage({ type: 'status', scope, message, error });
	}

	/** Repaint the status drawers from the server. */
	private async poll(): Promise<void> {
		await Promise.all([this.pollModels(), this.pollMemory(), this.pollJobs()]);
	}

	/** Poll the server for what is loaded, and paint the Serving Status drawer. */
	private async pollModels(): Promise<void> {
		if (!this.view) {
			return;
		}
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/models`, {
				signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
			});
			const body = (await response.json()) as { models: unknown };
			void this.view.webview.postMessage({ type: 'models', models: body.models });
		} catch (err) {
			// A timeout means the server is busy loading, not gone — leave the last
			// reading up. Only a refused connection reads as offline.
			if (!isTimeout(err)) {
				void this.view.webview.postMessage({ type: 'models', models: null });
			}
		}
	}

	/** Poll what the model is holding, and paint the Memory drawer. */
	private async pollMemory(): Promise<void> {
		if (!this.view) {
			return;
		}
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/memory`, {
				signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
			});
			const memory = await response.json();
			void this.view.webview.postMessage({ type: 'memory', memory });
		} catch (err) {
			if (!isTimeout(err)) {
				void this.view.webview.postMessage({ type: 'memory', memory: null });
			}
		}
	}

	/** Poll the server for the work it has in hand, and paint the Jobs Status drawer. */
	private async pollJobs(): Promise<void> {
		if (!this.view) {
			return;
		}
		try {
			const response = await fetch(`http://127.0.0.1:${this.port}/jobs`, {
				signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
			});
			const body = (await response.json()) as {
				jobs: { kind: string; path: string; status: string }[];
			};
			const jobs = body.jobs.map((job) => ({
				kind: job.kind,
				// Shown root-relative, like the manuscript name: the panel is narrow,
				// and the end of the path is the part that names the file.
				path: vscode.workspace.asRelativePath(vscode.Uri.file(job.path)),
				status: job.status,
			}));
			void this.view.webview.postMessage({ type: 'jobs', jobs });
		} catch (err) {
			if (!isTimeout(err)) {
				void this.view.webview.postMessage({ type: 'jobs', jobs: null });
			}
		}
	}

	private html(webview: vscode.Webview): string {
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
		const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'publish_view.js'));
		const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'publish.css'));
		const nonce = nonceString();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${style}" rel="stylesheet">
	<title>Publish</title>
</head>
<body>
	<details class="drawer" id="story" open>
		<summary>Story</summary>
		<div class="body">
			<div class="manuscript">
				<span id="manuscript-name" class="name">No story selected</span>
				<button id="choose" type="button">Choose…</button>
			</div>
		</div>
	</details>
	<details class="drawer" id="publishing" open>
		<summary>Publishing</summary>
		<div class="body">
			<label>Title
				<input id="f-title" type="text" placeholder="From the manuscript">
			</label>
			<label>Author
				<input id="f-author" type="text">
			</label>
			<label>Language
				<input id="f-language" type="text" placeholder="en">
			</label>
			<div class="cover">
				<span class="label">Cover</span>
				<span id="cover-name" class="name">None</span>
				<button id="choose-cover" type="button">Choose…</button>
				<button id="clear-cover" type="button" hidden>Clear</button>
			</div>
			<label class="blurb">Blurb
				<textarea id="f-blurb" rows="6"
					placeholder="Back-cover copy — shown here and saved beside the manuscript."></textarea>
			</label>
			<div class="actions">
				<button id="export" type="button" class="primary">Export as EPUB</button>
			</div>
			<div id="status" class="status" hidden></div>
		</div>
	</details>
	<details class="drawer" id="utils" open>
		<summary>Utils</summary>
		<div class="body">
			<div class="actions">
				<button id="build-representations" type="button" class="primary">Build representations</button>
			</div>
			<div class="actions">
				<button id="fix-grammar" type="button" class="primary">Fix grammar</button>
			</div>
			<div class="actions">
				<button id="section-attribution" type="button" class="primary">Section attribution</button>
			</div>
			<div id="utils-status" class="status" hidden></div>
		</div>
	</details>
	<details class="drawer" id="search-drawer" open>
		<summary>Search</summary>
		<div class="body">
			<div class="search-ask">
				<input id="search-phrase" type="text"
					placeholder="Describe what you are looking for">
				<button id="search-clear" type="button" title="Put the answer away" hidden>Clear</button>
			</div>
			<div id="search-note" class="status" hidden></div>
			<div id="search-hits" class="hits"></div>
		</div>
	</details>
	<details class="drawer" id="serving-status-drawer" open>
		<summary>Serving Status</summary>
		<div class="body">
			<div id="model-status" class="models"></div>
		</div>
	</details>
	<details class="drawer" id="memory-drawer" open>
		<summary>Memory</summary>
		<div class="body">
			<div id="memory" class="memory"></div>
		</div>
	</details>
	<details class="drawer" id="jobs-status-drawer" open>
		<summary>Jobs Status</summary>
		<div class="body">
			<div id="jobs-status" class="jobs"></div>
		</div>
	</details>
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
	}
}

/** The markdown file in the active editor, if that is what is open. */
function activeMarkdown(): vscode.Uri | undefined {
	const active = vscode.window.activeTextEditor;
	if (
		active?.document.languageId === 'markdown' &&
		active.document.uri.scheme === 'file'
	) {
		return active.document.uri;
	}
	return undefined;
}

async function pickMarkdown(): Promise<vscode.Uri | undefined> {
	const picked = await vscode.window.showOpenDialog({
		canSelectMany: false,
		openLabel: 'Select story',
		filters: { Markdown: ['md'] },
	});
	return picked?.[0];
}

async function detailOf(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { detail?: string };
		return body.detail ?? response.statusText;
	} catch {
		return response.statusText;
	}
}

/** The publication files live beside the manuscript; model.ts knows their names. */
function pubUriFor(md: vscode.Uri): vscode.Uri {
	return md.with({ path: pubPathFor(md.path) });
}

function blurbUriFor(md: vscode.Uri): vscode.Uri {
	return md.with({ path: blurbPathFor(md.path) });
}

function basename(uri: vscode.Uri): string {
	return uri.path.split('/').pop() ?? uri.path;
}

function describe(err: unknown): string {
	const message = (err as { message?: unknown } | null)?.message;
	return typeof message === 'string' ? message : String(err);
}

/** `AbortSignal.timeout` rejects with a `TimeoutError`; a refused connection does not. */
function isTimeout(err: unknown): boolean {
	return err instanceof Error && err.name === 'TimeoutError';
}

/** A promise that settles after `ms`. */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonceString(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let out = '';
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
