import { describe, expect, it } from 'vitest';

import type { Layer } from '../../../extension/story_graph/model';
import {
	boundsOf,
	edgePath,
	GAP_X,
	GAP_Y,
	LINE_H,
	layout,
	NODE_W,
	PAD_Y,
	wrap,
	type PlacedNode,
} from '../../../extension/story_graph/view_layout';

const node = (id: string, start: number, end: number, title = `node ${id}`) => ({
	id,
	title,
	start,
	end,
});

const edge = (from: string, to: string) => ({ id: `${from}-${to}`, from, to });

/** Layer 1 of data/story_1.graph.yaml: 3 → 1 → 2 → 4 → 5 → 6. */
const CHAIN: Layer = {
	id: '1',
	nodes: [
		node('1', 3, 5),
		node('2', 5, 11),
		node('3', 3, 3),
		node('4', 9, 11),
		node('5', 16, 17),
		node('6', 17, 21),
	],
	edges: [edge('1', '2'), edge('2', '4'), edge('3', '1'), edge('4', '5'), edge('5', '6')],
};

describe('layout — depth', () => {
	it('gives every node in a chain its own row, in edge order', () => {
		const placed = layout(CHAIN);

		expect([...placed.values()].map((item) => [item.id, item.depth])).toEqual(
			expect.arrayContaining([
				['3', 0],
				['1', 1],
				['2', 2],
				['4', 3],
				['5', 4],
				['6', 5],
			])
		);
	});

	it('uses the longest path, not the first one found', () => {
		// a → b → c and a → c. c must sit below b, not beside it.
		const placed = layout({
			id: 'x',
			nodes: [node('a', 1, 1), node('b', 2, 2), node('c', 3, 3)],
			edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')],
		});

		expect(placed.get('c')?.depth).toBe(2);
	});

	it('leaves unconnected nodes on the top row', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('a', 1, 1), node('b', 2, 2)],
			edges: [],
		});

		expect(placed.get('a')?.depth).toBe(0);
		expect(placed.get('b')?.depth).toBe(0);
	});

	it('terminates on a cycle instead of spinning', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('a', 1, 1), node('b', 2, 2), node('c', 3, 3)],
			edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
		});

		expect(placed.size).toBe(3);
		for (const item of placed.values()) {
			expect(Number.isFinite(item.depth)).toBe(true);
		}
	});
});

describe('layout — placement', () => {
	it('orders nodes in a row by where they appear in the manuscript', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('late', 20, 21), node('early', 2, 3), node('middle', 10, 11)],
			edges: [],
		});

		const row = [...placed.values()].sort((a, b) => a.x - b.x);
		expect(row.map((item) => item.id)).toEqual(['early', 'middle', 'late']);
	});

	it('breaks ties on line number by node id, so reloads are stable', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('b', 5, 6), node('a', 5, 6)],
			edges: [],
		});

		const row = [...placed.values()].sort((a, b) => a.x - b.x);
		expect(row.map((item) => item.id)).toEqual(['a', 'b']);
	});

	it('centres a row horizontally around zero', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('a', 1, 1), node('b', 2, 2)],
			edges: [],
		});

		const xs = [...placed.values()].map((item) => item.x).sort((a, b) => a - b);
		expect(xs[0]).toBe(-(2 * NODE_W + GAP_X) / 2);
		expect(xs[1]).toBe(xs[0] + NODE_W + GAP_X);
	});

	it('stacks rows down the canvas by the tallest node in each', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('a', 1, 1, 'short'), node('b', 2, 2, 'short')],
			edges: [edge('a', 'b')],
		});

		const top = placed.get('a')!;
		const below = placed.get('b')!;
		expect(top.y).toBe(0);
		expect(below.y).toBe(top.h + GAP_Y);
	});

	it('sizes a box from the number of wrapped lines', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('a', 1, 1, 'one'), node('b', 2, 2, 'a title long enough to wrap twice over')],
			edges: [],
		});

		expect(placed.get('a')!.h).toBe(PAD_Y * 2 + LINE_H);
		expect(placed.get('b')!.h).toBe(PAD_Y * 2 + placed.get('b')!.lines.length * LINE_H);
		expect(placed.get('b')!.h).toBeGreaterThan(placed.get('a')!.h);
	});

	it('places nothing for an empty layer', () => {
		expect(layout({ id: 'x', nodes: [], edges: [] }).size).toBe(0);
	});
});

describe('wrap', () => {
	it('keeps a short title on one line', () => {
		expect(wrap('checking')).toEqual(['checking']);
	});

	it('breaks a long title on word boundaries', () => {
		const lines = wrap('sarah looking for michael');

		expect(lines.length).toBeGreaterThan(1);
		expect(lines.join(' ')).toBe('sarah looking for michael');
	});

	it('never splits a word, even one longer than the limit', () => {
		const lines = wrap('antidisestablishmentarianismsupercalifragilistic');

		expect(lines).toEqual(['antidisestablishmentarianismsupercalifragilistic']);
	});

	it('collapses runs of whitespace', () => {
		expect(wrap('  knocking   at the   door  ')).toEqual(['knocking at the door']);
	});

	it('yields a single empty line for empty input', () => {
		expect(wrap('')).toEqual(['']);
		expect(wrap('   ')).toEqual(['']);
	});
});

describe('edgePath', () => {
	const box = (x: number, y: number): PlacedNode => ({
		id: 'n',
		title: 'n',
		start: 1,
		end: 1,
		lines: ['n'],
		depth: 0,
		x,
		y,
		w: 100,
		h: 40,
	});

	it('leaves the bottom of the source and meets the top of the target', () => {
		const path = edgePath(box(0, 0), box(0, 200));

		// Starts at the source's bottom centre, ends at the target's top centre.
		expect(path.startsWith('M 50 40 ')).toBe(true);
		expect(path.endsWith(' 50 200')).toBe(true);
	});

	it('produces a cubic curve', () => {
		expect(edgePath(box(0, 0), box(150, 200))).toMatch(/^M [\d.-]+ [\d.-]+ C /);
	});
});

describe('boundsOf', () => {
	it('spans every node box', () => {
		const placed = layout({
			id: 'x',
			nodes: [node('a', 1, 1), node('b', 2, 2)],
			edges: [edge('a', 'b')],
		});

		const bounds = boundsOf(placed.values())!;
		const items = [...placed.values()];

		expect(bounds.minX).toBe(Math.min(...items.map((i) => i.x)));
		expect(bounds.maxX).toBe(Math.max(...items.map((i) => i.x + i.w)));
		expect(bounds.minY).toBe(0);
		expect(bounds.maxY).toBe(Math.max(...items.map((i) => i.y + i.h)));
	});

	it('is undefined when there is nothing placed', () => {
		expect(boundsOf([])).toBeUndefined();
	});
});

describe('layout — pinned positions', () => {
	it('places a node at its stored coordinates instead of the computed row', () => {
		const placed = layout({
			id: '1',
			nodes: [
				{ id: '1', title: 'auto', start: 1, end: 1 },
				{ id: '2', title: 'pinned', start: 2, end: 2, x: 500, y: -80 },
			],
			edges: [edge('1', '2')],
		});

		expect([placed.get('2')?.x, placed.get('2')?.y]).toEqual([500, -80]);
		// The unpinned node still lands where the layout put it.
		expect(placed.get('1')?.y).toBe(0);
	});
});
