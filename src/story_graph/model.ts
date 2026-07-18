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
}

export interface GraphEdge {
	id: string;
	from: string;
	to: string;
}

/** An inclusive span of 1-based manuscript lines. */
export interface LineSpan {
	start: number;
	end: number;
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
