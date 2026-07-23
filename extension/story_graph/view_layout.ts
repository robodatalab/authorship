// Placing a layer's nodes on the canvas.
//
// Pure geometry — no DOM, no messaging — so it can be exercised directly in
// tests. view.ts turns the result into SVG.

import type { Layer } from './model';

export const NODE_W = 190;
export const LINE_H = 16;
export const PAD_X = 12;
export const PAD_Y = 11;
export const GAP_X = 34;
export const GAP_Y = 54;
/** Characters per line, roughly, at 12px. */
export const WRAP_AT = 24;

/** A node with its title wrapped and its box positioned. */
export interface PlacedNode {
	id: string;
	title: string;
	start: number;
	end: number;
	group?: number;
	lines: string[];
	depth: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/**
 * Layered top-to-bottom layout: an edge always points downward, so depth is the
 * longest path to a node. Within a row, nodes are ordered by where they appear in
 * the manuscript, which keeps the picture stable across reloads and roughly
 * matches reading order.
 */
export function layout(layer: Layer): Map<string, PlacedNode> {
	const byId = new Map<string, PlacedNode>();

	for (const node of layer.nodes) {
		const lines = wrap(node.title);
		byId.set(node.id, {
			id: node.id,
			title: node.title,
			start: node.start,
			end: node.end,
			group: node.group,
			lines,
			depth: 0,
			x: 0,
			y: 0,
			w: NODE_W,
			h: PAD_Y * 2 + lines.length * LINE_H,
		});
	}

	// Relax depths until they stop moving. Capped at node count, which both
	// terminates and keeps a cyclic graph from spinning forever.
	for (let pass = 0; pass < byId.size; pass++) {
		let changed = false;
		for (const edge of layer.edges) {
			const from = byId.get(edge.from);
			const to = byId.get(edge.to);
			if (from && to && to.depth < from.depth + 1) {
				to.depth = from.depth + 1;
				changed = true;
			}
		}
		if (!changed) {
			break;
		}
	}

	const rows = new Map<number, PlacedNode[]>();
	for (const item of byId.values()) {
		const row = rows.get(item.depth);
		if (row) {
			row.push(item);
		} else {
			rows.set(item.depth, [item]);
		}
	}

	let y = 0;
	for (const depth of [...rows.keys()].sort((a, b) => a - b)) {
		const row = rows.get(depth) ?? [];
		row.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

		const width = row.length * NODE_W + (row.length - 1) * GAP_X;
		let x = -width / 2;
		let tallest = 0;
		for (const item of row) {
			item.x = x;
			item.y = y;
			x += NODE_W + GAP_X;
			tallest = Math.max(tallest, item.h);
		}
		y += tallest + GAP_Y;
	}

	// A node the user has dragged carries its own coordinates; they win over the
	// computed row position. Edges just follow wherever the endpoints land.
	for (const node of layer.nodes) {
		if (node.x !== undefined && node.y !== undefined) {
			const item = byId.get(node.id);
			if (item) {
				item.x = node.x;
				item.y = node.y;
			}
		}
	}

	return byId;
}

/** Greedy word wrap — titles are short, so this doesn't need to be clever. */
export function wrap(text: string): string[] {
	const words = String(text ?? '')
		.split(/\s+/)
		.filter(Boolean);
	if (words.length === 0) {
		return [''];
	}

	const lines: string[] = [];
	let line = words[0];
	for (let i = 1; i < words.length; i++) {
		if (line.length + 1 + words[i].length <= WRAP_AT) {
			line += ' ' + words[i];
		} else {
			lines.push(line);
			line = words[i];
		}
	}
	lines.push(line);
	return lines;
}

/** A vertical-ish cubic curve from the bottom of `from` to the top of `to`. */
export function edgePath(from: PlacedNode, to: PlacedNode): string {
	const x1 = from.x + from.w / 2;
	const y1 = from.y + from.h;
	const x2 = to.x + to.w / 2;
	const y2 = to.y;
	const bend = Math.max(18, Math.abs(y2 - y1) / 2);
	return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
}

/** The bounding box of a laid-out layer, used to fit it to the viewport. */
export function boundsOf(placed: Iterable<PlacedNode>): Bounds | undefined {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let seen = false;

	for (const item of placed) {
		seen = true;
		minX = Math.min(minX, item.x);
		minY = Math.min(minY, item.y);
		maxX = Math.max(maxX, item.x + item.w);
		maxY = Math.max(maxY, item.y + item.h);
	}

	return seen ? { minX, minY, maxX, maxY } : undefined;
}
