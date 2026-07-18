// The story graph: a webview showing the manuscript's structure, kept in sync
// with the document it belongs to in both directions.
//
// The on-disk format lives beside the manuscript as `<name>.graph.yaml`. This
// module reads it, normalizes it, hosts the webview that draws it, and carries
// selections between the two — clicking a node highlights lines in the editor,
// and moving the cursor lights up the nodes covering it.

import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';

import { graphPathFor, mergeSpans, normalize, type Layer, type LineSpan } from './story_graph_model';

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

	/** Marks the lines belonging to the node that was last clicked. */
	private readonly highlight = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
		isWholeLine: true,
	});

	static reveal(
		context: vscode.ExtensionContext,
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
			new StoryGraphPanel(context, docUri, sourceColumn ?? vscode.ViewColumn.One)
		);
	}

	private constructor(
		private readonly context: vscode.ExtensionContext,
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
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
			}
		);
		this.panel.webview.html = this.html(this.panel.webview);

		this.disposables.push(
			this.panel.webview.onDidReceiveMessage((message) => {
				if (message?.type === 'select') {
					void this.focusRanges(message.ranges);
				}
			})
		);

		// The other direction: moving or extending the selection in the manuscript
		// lights up every node covering it.
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((event) => {
				if (event.textEditor.document.uri.toString() === this.docUri.toString()) {
					// Moving in the manuscript supersedes the last node click, so its
					// highlight goes with it.
					event.textEditor.setDecorations(this.highlight, []);
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

		void this.load();
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
			void this.panel.webview.postMessage({
				type: 'error',
				message: `Can't read ${basename(this.graphUri)} — ${describe(err)}`,
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

		const merged = mergeSpans(spans).map((span) => {
			const first = clamp(span.start - 1, 0, lastLine);
			const final = clamp(span.end - 1, 0, lastLine);
			return new vscode.Range(first, 0, final, doc.lineAt(final).text.length);
		});

		// An empty selection still has to be applied — switching to a layer that
		// matches nothing must clear the old highlight, not leave it behind.
		if (merged.length === 0) {
			const open = vscode.window.visibleTextEditors.find(
				(candidate) => candidate.document.uri.toString() === this.docUri.toString()
			);
			open?.setDecorations(this.highlight, []);
			return;
		}

		const editor = await vscode.window.showTextDocument(doc, {
			viewColumn: this.sourceColumn,
			preserveFocus: true,
			preview: false,
		});
		editor.setDecorations(this.highlight, merged);

		// Scroll to the earliest of them, so the top of the selection is on screen.
		editor.revealRange(merged[0], vscode.TextEditorRevealType.InCenterIfOutsideViewport);
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
		const active: Record<string, string[]> = {};

		for (const layer of this.layers) {
			const ids = new Set<string>();
			for (const selection of selections) {
				const first = selection.start.line + 1;
				const last = selection.end.line + 1;
				for (const node of layer.nodes) {
					// Inclusive 1-based ranges overlap unless one ends before the other starts.
					if (node.start <= last && node.end >= first) {
						ids.add(node.id);
					}
				}
			}
			active[layer.id] = [...ids];
		}

		void this.panel.webview.postMessage({ type: 'active', active, keepSelection });
	}

	private dispose(): void {
		StoryGraphPanel.panels.delete(this.docUri.toString());
		this.highlight.dispose(); // also clears the decoration from the editor
		for (const item of this.disposables) {
			item.dispose();
		}
	}

	private html(webview: vscode.Webview): string {
		const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
		const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'graph.js'));
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
	return err instanceof Error ? err.message : String(err);
}

function nonceString(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let out = '';
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
