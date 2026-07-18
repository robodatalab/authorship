// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';

// This method is called when your extension is activated, which happens the
// first time the Authorship view becomes visible.
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "authorship" is now active!');

	// The view container and view are declared in package.json under
	// contributes.viewsContainers / contributes.views. Registering the provider
	// here is what makes the view render; VS Code activates the extension
	// automatically the first time the view becomes visible.
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			'authorship.manuscript',
			new ManuscriptProvider()
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('authorship.showStoryGraph', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'markdown') {
				vscode.window.showInformationMessage(
					'Open a markdown file to see its story graph.'
				);
				return;
			}
			StoryGraphPanel.reveal(context, editor.document.uri, editor.viewColumn);
		})
	);
}

class ManuscriptProvider implements vscode.TreeDataProvider<string> {
	getTreeItem(element: string): vscode.TreeItem {
		return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
	}

	getChildren(element?: string): string[] {
		return element ? [] : ['Chapter One', 'Chapter Two'];
	}
}

// ---------------------------------------------------------------------------
// Story graph
// ---------------------------------------------------------------------------

/** The graph as the webview wants it — ids normalized to strings, edges as from/to. */
interface Graph {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

interface GraphNode {
	id: string;
	title: string;
	/** 1-based line numbers into the manuscript. */
	start: number;
	end: number;
}

interface GraphEdge {
	id: string;
	from: string;
	to: string;
}

/**
 * A webview showing one manuscript's story graph, opened beside the document it
 * belongs to. One panel per document, so re-running the command on the same file
 * brings the existing panel forward instead of stacking another one up.
 */
class StoryGraphPanel {
	private static readonly panels = new Map<string, StoryGraphPanel>();

	private readonly panel: vscode.WebviewPanel;
	private readonly graphUri: vscode.Uri;
	private readonly disposables: vscode.Disposable[] = [];

	/** Last graph read from disk, kept so selections can be matched against it. */
	private graph: Graph = { nodes: [], edges: [] };

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
					void this.focusLines(Number(message.start), Number(message.end));
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
			this.graph = normalize(parseYaml(new TextDecoder().decode(bytes)));
			void this.panel.webview.postMessage({ type: 'graph', graph: this.graph });

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
	 * Scroll the manuscript to a node's lines and highlight them. Focus stays in
	 * the graph, so you can keep clicking your way around the story.
	 */
	private async focusLines(start: number, end: number): Promise<void> {
		if (!Number.isFinite(start) || !Number.isFinite(end)) {
			return;
		}
		const doc = await vscode.workspace.openTextDocument(this.docUri);
		const editor = await vscode.window.showTextDocument(doc, {
			viewColumn: this.sourceColumn,
			preserveFocus: true,
			preview: false,
		});

		const last = doc.lineCount - 1;
		const first = clamp(Math.min(start, end) - 1, 0, last);
		const final = clamp(Math.max(start, end) - 1, 0, last);
		const range = new vscode.Range(first, 0, final, doc.lineAt(final).text.length);

		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		editor.setDecorations(this.highlight, [range]);
	}

	/**
	 * Tell the webview which nodes the selection touches. A node counts when its
	 * line range overlaps the selection at all, so a bare cursor (an empty
	 * selection) and a dragged range go through the same test — and a line sitting
	 * inside several nodes lights up all of them.
	 */
	private sendActive(selections: readonly vscode.Selection[], keepSelection = false): void {
		const ids = new Set<string>();
		for (const selection of selections) {
			const first = selection.start.line + 1;
			const last = selection.end.line + 1;
			for (const node of this.graph.nodes) {
				// Inclusive 1-based ranges overlap unless one ends before the other starts.
				if (node.start <= last && node.end >= first) {
					ids.add(node.id);
				}
			}
		}
		void this.panel.webview.postMessage({ type: 'active', ids: [...ids], keepSelection });
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

/** `story_1.md` sits next to `story_1.graph.yaml`. */
function graphUriFor(docUri: vscode.Uri): vscode.Uri {
	return docUri.with({ path: docUri.path.replace(/\.md$/i, '') + '.graph.yaml' });
}

/**
 * Flatten the on-disk shape into what the webview draws.
 *
 * Note that `start`/`end` mean different things in the two sections: line numbers
 * on a node, but node ids on an edge. Renaming them here keeps that ambiguity out
 * of the rest of the code.
 */
function normalize(raw: unknown): Graph {
	const root = (raw ?? {}) as Record<string, unknown>;
	const layer = (root.layer ?? root) as Record<string, unknown>;

	const nodes: GraphNode[] = asArray(layer.nodes)
		.map((entry) => {
			const item = entry as Record<string, unknown>;
			return {
				id: String(item.node ?? item.id ?? ''),
				title: String(item.title ?? item.node ?? item.id ?? ''),
				start: Number(item.start),
				end: Number(item.end),
			};
		})
		.filter((node) => node.id !== '' && Number.isFinite(node.start) && Number.isFinite(node.end));

	// Drop edges pointing at nodes that don't exist — the file is machine-written
	// and may be mid-update when we read it.
	const known = new Set(nodes.map((node) => node.id));
	const edges: GraphEdge[] = asArray(layer.edges)
		.map((entry, index) => {
			const item = entry as Record<string, unknown>;
			return {
				id: String(item.edge ?? item.id ?? index),
				from: String(item.start ?? item.from ?? ''),
				to: String(item.end ?? item.to ?? ''),
			};
		})
		.filter((edge) => known.has(edge.from) && known.has(edge.to));

	return { nodes, edges };
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
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

// This method is called when your extension is deactivated
export function deactivate() {}
