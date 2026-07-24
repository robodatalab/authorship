// The Publish sidebar: a webview view in the Authorship container where a
// manuscript is picked and its publication set, then exported to an EPUB beside
// it.
//
// The settings live in `<name>.pub.yaml` and the blurb in `<name>.blurb.md`,
// both sitting next to the manuscript exactly as `<name>.graph.yaml` does. This
// module owns those files; the webview is only the form. Exporting hands the
// manuscript and its settings to the server, which writes `<name>.epub` and is
// the one place that knows how to build the book.

import * as vscode from 'vscode';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
	DEFAULT_SETTINGS,
	blurbPathFor,
	pubPathFor,
	readFields,
	type PubSettings,
} from './model';

/** Where the chosen manuscript is remembered between sessions. */
const MANUSCRIPT_KEY = 'authorship.publish.manuscript';

export class PublishView implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	/** The manuscript being published, if one has been chosen. */
	private manuscript?: vscode.Uri;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly port: number
	) {
		// Pick up where we left off, or fall back to whatever markdown is open, so
		// the panel has something to publish the first time it is shown.
		const remembered = context.workspaceState.get<string>(MANUSCRIPT_KEY);
		if (remembered) {
			this.manuscript = vscode.Uri.file(remembered);
		} else {
			const active = vscode.window.activeTextEditor;
			if (
				active?.document.languageId === 'markdown' &&
				active.document.uri.scheme === 'file'
			) {
				this.manuscript = active.document.uri;
			}
		}
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
			}
		});

		view.onDidDispose(() => {
			this.view = undefined;
		});
	}

	// --- manuscript selection ---

	private async choose(): Promise<void> {
		const picked = await vscode.window.showOpenDialog({
			canSelectMany: false,
			openLabel: 'Publish',
			filters: { Markdown: ['md'] },
		});
		if (!picked || picked.length === 0) {
			return;
		}
		this.manuscript = picked[0];
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

	// --- view plumbing ---

	/** Read the files and hand the whole state to the view. */
	private async send(): Promise<void> {
		if (!this.view) {
			return;
		}
		await this.view.webview.postMessage({
			type: 'state',
			manuscript: this.manuscript ? basename(this.manuscript) : null,
			settings: await this.readSettings(),
			blurb: await this.readBlurb(),
		});
	}

	private async status(message: string, error: boolean): Promise<void> {
		await this.view?.webview.postMessage({ type: 'status', message, error });
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
	<details class="drawer" id="publishing" open>
		<summary>Publishing</summary>
		<div class="body">
			<div class="manuscript">
				<span id="manuscript-name" class="name">No manuscript selected</span>
				<button id="choose" type="button">Choose…</button>
			</div>
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
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
	}
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

function nonceString(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let out = '';
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
