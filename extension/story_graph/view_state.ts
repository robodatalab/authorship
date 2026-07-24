// What the graph view knows about layers and selection.
//
// Pure state — no DOM, no messaging — so the two behaviours that matter can be
// tested directly: selection travelling between the graph and the manuscript,
// and selection travelling between layers.
//
// The design is almost stateless on purpose. The only thing remembered is the
// anchor: the lines the user actually picked. Every layer's selection is derived
// from that anchor afresh, never from whatever the previous layer resolved to —
// deriving from the previous result made the selection creep outward on every
// switch.

import {
	addEdge as addEdgeToLayer,
	addNode as addNodeToLayer,
	deleteEdgeAt as deleteEdgeInLayer,
	deleteNode as deleteNodeFromLayer,
	moveNode as moveNodeInLayer,
	nodesTouching,
	updateNode as updateNodeInLayer,
	type ActiveByLayer,
	type Layer,
	type LineSpan,
	type NodeFields,
} from './model';

export class GraphViewState {
	private layers: Layer[] = [];
	private currentLayerId: string | null = null;

	/** Selected nodes in the layer on screen. A set, because one node in a coarse
	 *  layer can land on several in a finer one. Recomputed on every switch. */
	private selected = new Set<string>();

	/** What the user actually picked, in line space. */
	private anchor: LineSpan[] = [];

	/** Nodes the manuscript selection touches, per layer. */
	private active = new Map<string, Set<string>>();

	// -- reading -------------------------------------------------------------

	getLayers(): readonly Layer[] {
		return this.layers;
	}

	getCurrentLayerId(): string | null {
		return this.currentLayerId;
	}

	getCurrentLayer(): Layer | undefined {
		return this.layers.find((layer) => layer.id === this.currentLayerId);
	}

	getSelectedIds(): ReadonlySet<string> {
		return this.selected;
	}

	/** Active nodes for the layer on screen; other layers' sets stay held. */
	getActiveIds(): ReadonlySet<string> {
		return this.active.get(this.currentLayerId ?? '') ?? new Set<string>();
	}

	getAnchor(): readonly LineSpan[] {
		return this.anchor;
	}

	/** The lines of whatever is selected right now — what the manuscript highlights. */
	selectedSpans(): LineSpan[] {
		const layer = this.getCurrentLayer();
		if (!layer) {
			return [];
		}
		return layer.nodes
			.filter((node) => this.selected.has(node.id))
			.map((node) => ({ start: node.start, end: node.end }));
	}

	// -- transitions ---------------------------------------------------------

	/**
	 * Take a freshly read graph. The current layer is held across reloads where it
	 * still exists, so a background rewrite doesn't yank the view back to layer one.
	 */
	setLayers(next: Layer[]): void {
		this.layers = next;
		if (!this.layers.some((layer) => layer.id === this.currentLayerId)) {
			this.currentLayerId = this.layers.length > 0 ? this.layers[0].id : null;
		}
		this.deriveFromAnchor();
	}

	/** Returns false when the layer was already showing. */
	switchTo(id: string): boolean {
		if (id === this.currentLayerId) {
			return false;
		}
		this.currentLayerId = id;
		this.deriveFromAnchor();
		return true;
	}

	/**
	 * The user clicked a node. It becomes the anchor every other layer resolves
	 * against, and it drops whatever the manuscript selection had lit up — the two
	 * directions are mutually exclusive.
	 *
	 * Returns false when the id isn't in the layer on screen.
	 */
	selectNode(id: string): boolean {
		const node = this.getCurrentLayer()?.nodes.find((candidate) => candidate.id === id);
		if (!node) {
			return false;
		}

		this.anchor = [{ start: node.start, end: node.end }];
		this.selected = new Set([id]);
		this.active.clear();
		return true;
	}

	/**
	 * The manuscript selection moved. Every layer's matches arrive at once so
	 * switching layers needs no round trip back to the host.
	 *
	 * `keepSelection` is set by a graph reload, which isn't the user picking a side
	 * and so must not clear a node they clicked.
	 */
	applyActive(active: ActiveByLayer, keepSelection = false): void {
		this.active = new Map(
			Object.entries(active ?? {}).map(([layerId, ids]) => [layerId, new Set(ids)])
		);
		if (!keepSelection) {
			this.selected = new Set();
			this.anchor = [];
		}
	}

	// -- editing -------------------------------------------------------------
	//
	// One edit changes the layer on screen; the whole layer set is what goes to
	// disk, so the view reads it back with getLayers() and hands it to the host.
	// The selection is re-derived after every edit, so moving a node's lines or
	// deleting the one you had picked lands the highlight where it now belongs.

	/**
	 * Add a node to the layer on screen and return its id. Adding to an empty
	 * graph starts a first layer to hold it, so a graph can be drawn from nothing.
	 */
	addNode(fields: NodeFields): string {
		const layer = this.getCurrentLayer() ?? { id: '1', nodes: [], edges: [] };
		const present = this.layers.some((candidate) => candidate.id === layer.id);
		const { layer: next, id } = addNodeToLayer(layer, fields);
		this.layers = present
			? this.layers.map((candidate) => (candidate.id === layer.id ? next : candidate))
			: [...this.layers, next];
		this.currentLayerId = next.id;
		this.deriveFromAnchor();
		return id;
	}

	updateNode(id: string, fields: NodeFields): void {
		const layer = this.getCurrentLayer();
		if (layer) {
			this.replaceCurrentLayer(updateNodeInLayer(layer, id, fields));
		}
	}

	moveNode(id: string, x: number, y: number): void {
		const layer = this.getCurrentLayer();
		if (layer) {
			this.replaceCurrentLayer(moveNodeInLayer(layer, id, x, y));
		}
	}

	/**
	 * Pin a batch of nodes at given positions in one step. Used to freeze the
	 * current arrangement before a structural edit, so removing or adding an edge
	 * doesn't re-flow the nodes it left untouched.
	 */
	pinPositions(positions: ReadonlyMap<string, { x: number; y: number }>): void {
		const layer = this.getCurrentLayer();
		if (!layer) {
			return;
		}
		this.replaceCurrentLayer({
			...layer,
			nodes: layer.nodes.map((node) => {
				const at = positions.get(node.id);
				return at ? { ...node, x: at.x, y: at.y } : node;
			}),
		});
	}

	deleteNode(id: string): void {
		const layer = this.getCurrentLayer();
		if (layer) {
			this.replaceCurrentLayer(deleteNodeFromLayer(layer, id));
		}
	}

	addEdge(from: string, to: string): void {
		const layer = this.getCurrentLayer();
		if (layer) {
			this.replaceCurrentLayer(addEdgeToLayer(layer, from, to));
		}
	}

	deleteEdgeAt(index: number): void {
		const layer = this.getCurrentLayer();
		if (layer) {
			this.replaceCurrentLayer(deleteEdgeInLayer(layer, index));
		}
	}

	private replaceCurrentLayer(next: Layer): void {
		this.layers = this.layers.map((layer) =>
			layer.id === this.currentLayerId ? next : layer
		);
		this.deriveFromAnchor();
	}

	/**
	 * Work out which nodes in the current layer the anchor lands on, by line
	 * overlap. Going coarse, a fine node's lines fall inside one broad node; going
	 * fine, that broad node's lines cover several narrow ones and all are picked up.
	 */
	private deriveFromAnchor(): void {
		const layer = this.getCurrentLayer();
		this.selected =
			layer && this.anchor.length > 0
				? new Set(nodesTouching(layer, this.anchor))
				: new Set();
	}
}
