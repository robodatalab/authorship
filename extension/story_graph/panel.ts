// The story graph: a webview showing the manuscript's structure, kept in sync
// with the document it belongs to in both directions.
//
// The on-disk format lives beside the manuscript as `<name>.graph.yaml`. This
// module reads it, normalizes it, hosts the webview that draws it, and carries
// selections between the two — clicking a node highlights lines in the editor,
// and moving the cursor lights up the nodes covering it.

import * as vscode from 'vscode';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { Highlights } from '../highlight/orchestrator';
import type { BuildActivity } from '../llm/activity';
import {
	denormalize,
	graphPathFor,
	mergeSpans,
	nodesTouching,
	normalize,
	type ActiveByLayer,
	type Layer,
	type LineSpan,
} from './model';

/** Who this is, to the highlight orchestrator. */
const SOURCE = 'story-graph';

/**
 * A webview showing one manuscript's story graph, opened beside the document it
 * belongs to. One panel per document, so re-running the command on the same file
 * brings the existing panel forward instead of stacking another one up.
 */
export class StoryGraphPanel {
	private static readonly panels = new Map<string, StoryGraphPanel>();

	private readonly panel: vscode.WebviewPanel;
	private readonly graphUri: vscode.Uri;
	private readonly disposables: vscode.Disposable[] = [];

	/** Last graph read from disk, kept so selections can be matched against it. */
	private layers: Layer[] = [];

	static reveal(
		context: vscode.ExtensionContext,
		activity: BuildActivity,
		highlights: Highlights,
		docUri: vscode.Uri,
		sourceColumn: vscode.ViewColumn | undefined
	): void {
		const key = docUri.toString();
		const existing = StoryGraphPanel.panels.get(key);
		if (existing) {
			// `true` keeps focus in the editor the command was invoked from.
			existing.panel.reveal(vscode.ViewColumn.Beside, true);
			void existing.load();
			return;
		}
		StoryGraphPanel.panels.set(
			key,
			new StoryGraphPanel(
				context,
				activity,
				highlights,
				docUri,
				sourceColumn ?? vscode.ViewColumn.One
			)
		);
	}

	private constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly activity: BuildActivity,
		private readonly highlights: Highlights,
		private readonly docUri: vscode.Uri,
		private readonly sourceColumn: vscode.ViewColumn
	) {
		this.graphUri = graphUriFor(docUri);

		this.panel = vscode.window.createWebviewPanel(
			'authorship.storyGraph',
			`Graph: ${basename(docUri)}`,
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'media'),
					vscode.Uri.joinPath(context.extensionUri, 'dist'),
				],
			}
		);
		this.panel.webview.html = this.html(this.panel.webview);

		this.disposables.push(
			this.panel.webview.onDidReceiveMessage((message) => {
				if (message?.type === 'select') {
					void this.focusRanges(message.ranges);
				} else if (message?.type === 'edit') {
						void this.save(message.layers);
					} else if (message?.type === 'ready') {
					// The view asks rather than being told on construction: a message
					// posted before its script ran is simply gone, and a panel opened
					// during a rebuild would then show no sign of one.
					this.sendBuild();
					void this.load();
				}
			})
		);

		// A rebuild is worth showing in the graph itself. It reads the whole
		// manuscript through the model, so the picture on screen is the previous
		// answer for minutes at a stretch, and nothing about it says so.
		this.disposables.push({
			dispose: this.activity.onChange((path) => {
				if (path === this.docUri.fsPath) {
					this.sendBuild();
				}
			}),
		});

		// The other direction: moving or extending the selection in the manuscript
		// lights up every node covering it.
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((event) => {
				if (event.textEditor.document.uri.toString() === this.docUri.toString()) {
					// Moving out of the clicked node supersedes it, and the orchestrator
					// puts its highlight out — this only has to say which nodes the
					// cursor is in now.
					this.sendActive(event.selections);
				}
			})
		);

		// The graph file is expected to be rewritten by a background process, so
		// watch it and push updates rather than reading it once at open time.
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(
				vscode.Uri.joinPath(this.graphUri, '..'),
				basename(this.graphUri)
			)
		);
		this.disposables.push(
			watcher,
			watcher.onDidChange(() => void this.load()),
			watcher.onDidCreate(() => void this.load()),
			watcher.onDidDelete(() => void this.load())
		);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Read now as well as on `ready`. Both are needed and neither is enough:
		// the graph read is async, so it has always landed after the view began
		// listening, while the build state is posted synchronously and would be
		// dropped. Making the graph wait for `ready` too would leave the panel
		// blank against a stale view bundle, which is a bad way to fail.
		void this.load();
	}

	/** Say whether this manuscript is being read by the model right now. */
	private sendBuild(): void {
		const build = this.activity.get(this.docUri.fsPath);
		void this.panel.webview.postMessage({
			type: 'build',
			building: build !== undefined,
			startedAt: build?.startedAt,
		});
	}

	/** Read the graph file and hand it to the webview. */
	private async load(): Promise<void> {
		try {
			const bytes = await vscode.workspace.fs.readFile(this.graphUri);
			this.layers = normalize(parseYaml(new TextDecoder().decode(bytes)));
			void this.panel.webview.postMessage({ type: 'graph', layers: this.layers });

			// Reflect wherever the cursor already is, rather than waiting for it to move.
			const editor = vscode.window.visibleTextEditors.find(
				(candidate) => candidate.document.uri.toString() === this.docUri.toString()
			);
			if (editor) {
				// A background rewrite of the graph file isn't the user picking a
				// side, so it must not clear a node they clicked.
				this.sendActive(editor.selections, true);
			}
		} catch (err) {
			// A manuscript that has never been built has no graph file, and a first
			// build has none for the whole time it runs — which is precisely when
			// this panel is open to watch. That is an absence, not a fault, and
			// reporting it as one made every first build read as broken.
			if (isMissing(err)) {
				this.layers = [];
				void this.panel.webview.postMessage({ type: 'graph', layers: [] });
				return;
			}
			void this.panel.webview.postMessage({
				type: 'error',
				message: `Can't read ${basename(this.graphUri)} — ${describe(err)}`,
			});
		}
	}

	/**
	 * Write the edited graph back beside the manuscript. The file watcher then
	 * reloads it, so the view is confirmed along the same path a background rewrite
	 * takes — there is no special case for our own writes. Saving canonicalizes the
	 * file: it round-trips through the reader's rules, so dangling edges are pruned
	 * and edges renumbered, the same shape the builder emits.
	 */
	private async save(raw: unknown): Promise<void> {
		const layers = Array.isArray(raw) ? (raw as Layer[]) : [];
		try {
			const text = stringifyYaml(denormalize(layers), { lineWidth: 0 });
			await vscode.workspace.fs.writeFile(this.graphUri, new TextEncoder().encode(text));
		} catch (err) {
			void this.panel.webview.postMessage({
				type: 'error',
				message: `Can't write ${basename(this.graphUri)} — ${describe(err)}`,
			});
		}
	}

	/**
	 * Scroll the manuscript to the selected lines and highlight them. Focus stays
	 * in the graph, so you can keep clicking your way around the story.
	 *
	 * Several ranges arrive at once when a coarse node's selection is carried into
	 * a finer layer and lands on more than one node.
	 */
	private async focusRanges(raw: unknown): Promise<void> {
		const input = Array.isArray(raw) ? raw : [];
		const doc = await vscode.workspace.openTextDocument(this.docUri);
		const lastLine = doc.lineCount - 1;

		const spans: LineSpan[] = [];
		for (const entry of input) {
			const start = Number((entry as { start?: unknown })?.start);
			const end = Number((entry as { end?: unknown })?.end);
			if (!Number.isFinite(start) || !Number.isFinite(end)) {
				continue;
			}
			spans.push({ start: Math.min(start, end), end: Math.max(start, end) });
		}

		// The graph counts lines from one; the editor counts from zero.
		const merged = mergeSpans(spans).map((span) => ({
			start: clamp(span.start - 1, 0, lastLine),
			end: clamp(span.end - 1, 0, lastLine),
		}));

		// An empty selection still has to be applied — switching to a layer that
		// matches nothing must clear the old highlight, not leave it behind. The
		// orchestrator reads an empty claim as exactly that.
		this.highlights.claim(SOURCE, 'focus', this.docUri, merged);
		if (merged.length === 0) {
			return;
		}

		const editor = await vscode.window.showTextDocument(doc, {
			viewColumn: this.sourceColumn,
			preserveFocus: true,
			preview: false,
		});
		// Scroll to the earliest of them, so the top of the selection is on screen.
		editor.revealRange(
			new vscode.Range(merged[0].start, 0, merged[0].end, 0),
			vscode.TextEditorRevealType.InCenterIfOutsideViewport
		);
	}

	/**
	 * Tell the webview which nodes the selection touches. A node counts when its
	 * line range overlaps the selection at all, so a bare cursor (an empty
	 * selection) and a dragged range go through the same test — and a line sitting
	 * inside several nodes lights up all of them.
	 *
	 * Every layer is matched, not just the visible one, so switching layers shows
	 * the right highlights immediately without a round trip back to the host.
	 */
	private sendActive(selections: readonly vscode.Selection[], keepSelection = false): void {
		// Editor positions count lines from zero; the graph file counts from one.
		const spans: LineSpan[] = selections.map((selection) => ({
			start: selection.start.line + 1,
			end: selection.end.line + 1,
		}));

		const active: ActiveByLayer = {};
		for (const layer of this.layers) {
			active[layer.id] = nodesTouching(layer, spans);
		}

		// `spans` rides along so a new node can be seeded from the lines the user
		// has selected in the manuscript, which are otherwise invisible to the view.
		void this.panel.webview.postMessage({ type: 'active', active, keepSelection, spans });
	}

	private dispose(): void {
		StoryGraphPanel.panels.delete(this.docUri.toString());
		// The panel is gone, so what it lit up has nothing left pointing at it.
		this.highlights.release(SOURCE);
		for (const item of this.disposables) {
			item.dispose();
		}
	}

	private html(webview: vscode.Webview): string {
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
		const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'story_graph_view.js'));
		const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'graph.css'));
		const nonce = nonceString();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${style}" rel="stylesheet">
	<title>Story Graph</title>
</head>
<body>
	<div id="status" class="status" hidden></div>
	<div id="layers" class="layers" role="group" aria-label="Story layers" hidden></div>
	<div id="build" class="build" role="status" hidden>
		<span class="spinner"></span>
		<span id="build-label"></span>
	</div>
	<div id="tools" class="tools" role="group" aria-label="Edit graph">
		<button id="add-node" type="button">Add node</button>
		<button id="delete-selection" type="button" hidden title="Delete selected (Del)">Delete</button>
	</div>
	<div id="node-editor" class="editor" hidden>
		<label>Title
			<input id="ed-title" type="text">
		</label>
		<div class="editor-row">
			<label>Group
				<input id="ed-group" type="number" min="1" placeholder="none">
			</label>
			<label>Start
				<input id="ed-start" type="number" min="1">
			</label>
			<label>End
				<input id="ed-end" type="number" min="1">
			</label>
		</div>
		<div class="editor-actions">
			<span class="spacer"></span>
			<button id="ed-cancel" type="button">Cancel</button>
			<button id="ed-save" type="button" class="primary">Save</button>
		</div>
	</div>
	<svg id="canvas" role="img" aria-label="Story graph">
		<defs>
			<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
				markerWidth="6" markerHeight="6" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" />
			</marker>
		</defs>
		<g id="viewport"></g>
	</svg>
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
	}
}

function graphUriFor(docUri: vscode.Uri): vscode.Uri {
	return docUri.with({ path: graphPathFor(docUri.path) });
}

function basename(uri: vscode.Uri): string {
	return uri.path.split('/').pop() ?? uri.path;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function describe(err: unknown): string {
	const message = (err as { message?: unknown } | null)?.message;
	return typeof message === 'string' ? message : String(err);
}

/**
 * Is this "there is no such file" rather than "that file would not read"?
 *
 * Nothing here asks `instanceof Error`, and that is the point: what
 * `workspace.fs` rejects with does not pass that test. The first attempt at this
 * gated on it and so never ran — the giveaway was `describe` falling through to
 * `String(err)` and prefixing the message with `Error:`. The code and the text
 * are read off the value directly instead.
 */
function isMissing(err: unknown): boolean {
	const code = (err as { code?: unknown } | null)?.code;
	if (code === 'FileNotFound' || code === 'ENOENT') {
		return true;
	}
	return describe(err).includes('ENOENT');
}

function nonceString(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let out = '';
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
