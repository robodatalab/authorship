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

import type { Layer, LineSpan } from './model';

/** Node ids the manuscript selection touches, keyed by layer id. */
export type ActiveByLayer = Record<string, string[]>;

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

	/**
	 * Work out which nodes in the current layer the anchor lands on, by line
	 * overlap. Going coarse, a fine node's lines fall inside one broad node; going
	 * fine, that broad node's lines cover several narrow ones and all are picked up.
	 */
	private deriveFromAnchor(): void {
		this.selected = new Set();

		const layer = this.getCurrentLayer();
		if (!layer || this.anchor.length === 0) {
			return;
		}
		for (const node of layer.nodes) {
			const hit = this.anchor.some((span) => node.start <= span.end && node.end >= span.start);
			if (hit) {
				this.selected.add(node.id);
			}
		}
	}
}
