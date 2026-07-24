// The graph's own selection — the nodes and edges picked out for moving or
// deleting, as opposed to the manuscript-linked selection in view_state.
//
// It can hold several of each at once: a plain click replaces the selection, a
// modified click adds to or removes from it. Kept apart from the DOM so the
// picking rules can be tested directly; view.ts reads it to paint the highlights
// and to decide what a delete removes.

export class GraphSelection {
	private nodes = new Set<string>();
	/** Edges by their position in the layer's edge list. */
	private edges = new Set<number>();

	/**
	 * Click a node. On its own it becomes the whole selection; with a modifier it
	 * toggles in or out of it. Either way the edge selection is dropped — nodes and
	 * edges aren't selected together.
	 */
	clickNode(id: string, additive: boolean): void {
		if (additive) {
			toggle(this.nodes, id);
		} else {
			this.nodes = new Set([id]);
		}
		this.edges.clear();
	}

	/** Click an edge: replace the selection, or with a modifier toggle it in.
	 *  Either way any selected nodes are dropped — the mirror of clickNode, so the
	 *  selection is only ever all-nodes or all-edges, never a mix. */
	clickEdge(index: number, additive: boolean): void {
		if (additive) {
			toggle(this.edges, index);
		} else {
			this.edges = new Set([index]);
		}
		this.nodes.clear();
	}

	/** Select exactly one node, nothing else — used when the editor opens on it. */
	only(id: string): void {
		this.nodes = new Set([id]);
		this.edges.clear();
	}

	clear(): void {
		this.nodes.clear();
		this.edges.clear();
	}

	/** Drop a single node from the selection, leaving the rest. */
	removeNode(id: string): void {
		this.nodes.delete(id);
	}

	hasNode(id: string): boolean {
		return this.nodes.has(id);
	}

	hasEdge(index: number): boolean {
		return this.edges.has(index);
	}

	/** Any nodes selected — what lights up their incident edges. */
	hasNodes(): boolean {
		return this.nodes.size > 0;
	}

	/** Nothing selected at all — what hides the delete action. */
	isEmpty(): boolean {
		return this.nodes.size === 0 && this.edges.size === 0;
	}

	nodeIds(): string[] {
		return [...this.nodes];
	}

	/** Selected edge positions, highest first, so deleting them in order doesn't
	 *  shift the indices still to come. */
	edgeIndices(): number[] {
		return [...this.edges].sort((a, b) => b - a);
	}

	/** After a reload, forget anything that is no longer there: nodes whose id has
	 *  gone, and edge positions past the end of the (possibly shorter) list. */
	prune(existingNodeIds: ReadonlySet<string>, edgeCount: number): void {
		for (const id of [...this.nodes]) {
			if (!existingNodeIds.has(id)) {
				this.nodes.delete(id);
			}
		}
		for (const index of [...this.edges]) {
			if (index >= edgeCount) {
				this.edges.delete(index);
			}
		}
	}
}

function toggle<T>(set: Set<T>, value: T): void {
	if (set.has(value)) {
		set.delete(value);
	} else {
		set.add(value);
	}
}
