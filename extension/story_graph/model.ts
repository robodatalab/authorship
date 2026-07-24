// The pure logic behind the story graph: reading the on-disk format, locating the
// graph file, and working out which stretches of manuscript belong together.
//
// Deliberately free of the `vscode` module, so it can be unit tested without
// launching an editor. Everything here deals in plain line numbers and strings;
// story_graph.ts converts to vscode.Range / vscode.Uri at the call sites.

/**
 * One layer of the story, as the webview wants it — ids normalized to strings,
 * edges as from/to. Node ids are only unique within a layer, so nothing keyed by
 * node id may be shared between them.
 */
export interface Layer {
	id: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface GraphNode {
	id: string;
	title: string;
	/** 1-based line numbers into the manuscript. */
	start: number;
	end: number;
	/** The plot this node belongs to, for layers that have several. */
	group?: number;
	/** A pinned canvas position. Absent means the layout is free to place it;
	 *  set once the user drags it, and honored by the layout from then on. */
	x?: number;
	y?: number;
}

export interface GraphEdge {
	id: string;
	from: string;
	to: string;
	group?: number;
}

/** An inclusive span of 1-based manuscript lines. */
export interface LineSpan {
	start: number;
	end: number;
}

/** Node ids the manuscript selection touches, keyed by layer id. */
export type ActiveByLayer = Record<string, string[]>;

/**
 * Do two inclusive line spans share at least one line?
 *
 * This is the whole relationship between the graph and the manuscript, and it is
 * used in both directions: the host matches the editor selection against every
 * layer, and the view matches the anchor against the layer being switched to.
 * A shared boundary line counts — nodes routinely end where the next begins.
 */
export function spansOverlap(a: LineSpan, b: LineSpan): boolean {
	return a.start <= b.end && a.end >= b.start;
}

/** Ids of the nodes in `layer` whose lines overlap any of `spans`. */
export function nodesTouching(layer: Layer, spans: readonly LineSpan[]): string[] {
	return layer.nodes
		.filter((node) => spans.some((span) => spansOverlap(node, span)))
		.map((node) => node.id);
}

/** `story_1.md` sits next to `story_1.graph.yaml`. */
export function graphPathFor(docPath: string): string {
	return docPath.replace(/\.md$/i, '') + '.graph.yaml';
}

/**
 * Flatten the on-disk shape into the layers the webview draws.
 *
 * `layer:` may be a list of layers or, as it was written originally, a single
 * mapping; both are accepted so an older file still opens.
 */
export function normalize(raw: unknown): Layer[] {
	const root = (raw ?? {}) as Record<string, unknown>;
	const declared = root.layer ?? root.layers ?? root;
	const list = Array.isArray(declared) ? declared : [declared];

	return list
		.map((entry, index) => normalizeLayer(entry, index))
		.filter((layer) => layer.nodes.length > 0);
}

/**
 * Note that `start`/`end` mean different things in the two sections: line numbers
 * on a node, but node ids on an edge. Renaming them here keeps that ambiguity out
 * of the rest of the code.
 */
function normalizeLayer(entry: unknown, index: number): Layer {
	const layer = (entry ?? {}) as Record<string, unknown>;

	const nodes: GraphNode[] = asArray(layer.nodes)
		.map((entry) => {
			const item = entry as Record<string, unknown>;
			return {
				id: String(item.node ?? item.id ?? ''),
				title: String(item.title ?? item.node ?? item.id ?? ''),
				start: Number(item.start),
				end: Number(item.end),
				group: asGroup(item.group),
				x: asCoord(item.x),
				y: asCoord(item.y),
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
				group: asGroup(item.group),
			};
		})
		.filter((edge) => known.has(edge.from) && known.has(edge.to));

	return { id: String(layer.id ?? index + 1), nodes, edges };
}

/**
 * Collapse spans that share lines into single stretches.
 *
 * Node ranges routinely overlap — one node ending on the same line another
 * begins. Painted as separate decorations, the shared lines get the translucent
 * background applied twice and read as a second, stronger selection.
 */
export function mergeSpans(spans: readonly LineSpan[]): LineSpan[] {
	const sorted = [...spans].sort((a, b) => a.start - b.start);
	const merged: LineSpan[] = [];

	for (const span of sorted) {
		const previous = merged[merged.length - 1];
		if (previous && span.start <= previous.end) {
			// Only extend — a span fully inside the previous one changes nothing.
			if (span.end > previous.end) {
				previous.end = span.end;
			}
		} else {
			merged.push({ ...span });
		}
	}

	return merged;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asGroup(value: unknown): number | undefined {
	const group = Number(value);
	return Number.isFinite(group) ? group : undefined;
}

function asCoord(value: unknown): number | undefined {
	const coord = Number(value);
	return value === undefined || value === null || !Number.isFinite(coord) ? undefined : coord;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------
//
// The graph is written back through the same shapes `normalize` reads, so a save
// is the exact inverse of a load: view model → on-disk document. The single-layer
// transforms below are pure and return fresh layers, so `view_state` can apply
// one to the layer on screen and hand the result on without holding any editing
// logic of its own.

/** The fields of a node the user can set. `group` cleared means no group. */
export interface NodeFields {
	title: string;
	start: number;
	end: number;
	group?: number;
}

/**
 * The inverse of `normalize`: the layers as the file wants them.
 *
 * Field order, and the convention that an edge's `start`/`end` are node ids,
 * match what the builder writes (server/story_graph.py), so a file saved from the
 * view sits beside one written by the model without a diff of style. Edges are
 * renumbered by position, as the builder does — an edge id carries no meaning of
 * its own. Ids that read as integers are emitted as integers, so `node: 1` does
 * not come back as `node: "1"`.
 */
export function denormalize(layers: readonly Layer[]): { layer: unknown[] } {
	return {
		layer: layers.map((layer) => ({
			id: numish(layer.id),
			nodes: layer.nodes.map((node) => {
				const fields: Record<string, unknown> = {
					node: numish(node.id),
					title: node.title,
					start: node.start,
					end: node.end,
				};
				if (node.group !== undefined) {
					fields.group = node.group;
				}
				if (node.x !== undefined && node.y !== undefined) {
					fields.x = node.x;
					fields.y = node.y;
				}
				return fields;
			}),
			edges: layer.edges.map((edge, index) => {
				const fields: Record<string, unknown> = {
					edge: index + 1,
					start: numish(edge.from),
					end: numish(edge.to),
				};
				if (edge.group !== undefined) {
					fields.group = edge.group;
				}
				return fields;
			}),
		})),
	};
}

/**
 * Do two graphs carry the same nodes and edges? Key order, an absent field vs an
 * explicit `undefined`, and edge ids (which are only positional) are all
 * disregarded, so a graph compares equal to itself after a save→reload round
 * trip. Used to tell our own write landing back from a change made underneath us.
 */
export function sameGraph(a: readonly Layer[], b: readonly Layer[]): boolean {
	return canonicalize(a) === canonicalize(b);
}

function canonicalize(layers: readonly Layer[]): string {
	return JSON.stringify(
		layers.map((layer) => ({
			id: layer.id,
			nodes: layer.nodes.map((node) => [
				node.id,
				node.title,
				node.start,
				node.end,
				node.group ?? null,
				node.x ?? null,
				node.y ?? null,
			]),
			edges: layer.edges.map((edge) => [edge.from, edge.to, edge.group ?? null]),
		}))
	);
}

/** Add a node to a layer, giving it the next free id. The id comes back too. */
export function addNode(layer: Layer, fields: NodeFields): { layer: Layer; id: string } {
	const id = nextId(layer.nodes.map((node) => node.id));
	const node: GraphNode = { id, title: fields.title, start: fields.start, end: fields.end };
	if (fields.group !== undefined) {
		node.group = fields.group;
	}
	return { layer: { ...layer, nodes: [...layer.nodes, node] }, id };
}

/**
 * Overwrite a node's editable fields. The group is written even when cleared
 * (set to undefined), so blanking it in the editor really clears it; the pinned
 * position is left as-is, since the form doesn't touch it. A no-op if the id
 * isn't in the layer.
 */
export function updateNode(layer: Layer, id: string, fields: NodeFields): Layer {
	return {
		...layer,
		nodes: layer.nodes.map((node) =>
			node.id === id
				? { ...node, title: fields.title, start: fields.start, end: fields.end, group: fields.group }
				: node
		),
	};
}

/** Pin a node to a canvas position. */
export function moveNode(layer: Layer, id: string, x: number, y: number): Layer {
	return {
		...layer,
		nodes: layer.nodes.map((node) => (node.id === id ? { ...node, x, y } : node)),
	};
}

/** Drop a node and every edge touching it — a dangling edge would be dropped on
 *  the next read anyway, so it goes now. */
export function deleteNode(layer: Layer, id: string): Layer {
	return {
		...layer,
		nodes: layer.nodes.filter((node) => node.id !== id),
		edges: layer.edges.filter((edge) => edge.from !== id && edge.to !== id),
	};
}

/**
 * Join two nodes. Refuses a self-loop, an endpoint not in the layer, or a
 * duplicate of an edge already there — the graph carries at most one `from`→`to`,
 * though `from`→`to` and `to`→`from` may both exist.
 */
export function addEdge(layer: Layer, from: string, to: string): Layer {
	const known = new Set(layer.nodes.map((node) => node.id));
	const duplicate = layer.edges.some((edge) => edge.from === from && edge.to === to);
	if (from === to || !known.has(from) || !known.has(to) || duplicate) {
		return layer;
	}
	const edge: GraphEdge = { id: nextId(layer.edges.map((e) => e.id)), from, to };
	return { ...layer, edges: [...layer.edges, edge] };
}

/** Remove the edge at a position in the layer's edge list. Out of range is a
 *  no-op, returning the same layer. */
export function deleteEdgeAt(layer: Layer, index: number): Layer {
	if (index < 0 || index >= layer.edges.length) {
		return layer;
	}
	return { ...layer, edges: layer.edges.filter((_, i) => i !== index) };
}

/** One past the highest integer id in use, as a string. Non-integer ids are
 *  ignored, and an empty set starts at 1. */
function nextId(ids: readonly string[]): string {
	let max = 0;
	for (const id of ids) {
		if (/^\d+$/.test(id)) {
			max = Math.max(max, Number(id));
		}
	}
	return String(max + 1);
}

function numish(value: string): string | number {
	return /^\d+$/.test(value) ? Number(value) : value;
}
