import { beforeEach, describe, expect, it } from 'vitest';

import type { Layer } from '../../../extension/story_graph/model';
import { GraphViewState } from '../../../extension/story_graph/view_state';

const node = (id: string, start: number, end: number, title = `node ${id}`) => ({
	id,
	title,
	start,
	end,
});

const edge = (from: string, to: string) => ({ id: `${from}-${to}`, from, to });

/**
 * The two layers from data/story_1.graph.yaml. Node ids repeat across them on
 * purpose — `1` is "knocking at the door" in the fine layer and "introduction" in
 * the coarse one.
 */
const FINE: Layer = {
	id: '1',
	nodes: [
		node('1', 3, 5, 'knocking at the door'),
		node('2', 5, 11, 'checking'),
		node('3', 3, 3, 'preparing for a walk'),
		node('4', 9, 11, 'sarah curious'),
		node('5', 16, 17, 'sarah calling michael'),
		node('6', 17, 21, 'sarah looking for michael'),
	],
	edges: [edge('1', '2'), edge('2', '4'), edge('3', '1'), edge('4', '5'), edge('5', '6')],
};

const COARSE: Layer = {
	id: '2',
	nodes: [node('1', 1, 11, 'introduction'), node('2', 14, 21, 'investigation')],
	edges: [edge('1', '2')],
};

const LAYERS = [FINE, COARSE];

const selected = (state: GraphViewState) => [...state.getSelectedIds()].sort();
const active = (state: GraphViewState) => [...state.getActiveIds()].sort();

/** What the host sends after a cursor move: every layer matched at once. */
const activeFor = (first: number, last: number) => {
	const out: Record<string, string[]> = {};
	for (const layer of LAYERS) {
		out[layer.id] = layer.nodes
			.filter((n) => n.start <= last && n.end >= first)
			.map((n) => n.id);
	}
	return out;
};

describe('layers', () => {
	let state: GraphViewState;

	beforeEach(() => {
		state = new GraphViewState();
		state.setLayers(LAYERS);
	});

	it('opens on the first layer', () => {
		expect(state.getCurrentLayerId()).toBe('1');
	});

	it('switches layer, and reports when nothing changed', () => {
		expect(state.switchTo('2')).toBe(true);
		expect(state.getCurrentLayerId()).toBe('2');
		expect(state.switchTo('2')).toBe(false);
	});

	it('holds the current layer across a graph reload', () => {
		state.switchTo('2');
		state.setLayers(LAYERS);

		expect(state.getCurrentLayerId()).toBe('2');
	});

	it('falls back to the first layer when the current one disappears', () => {
		state.switchTo('2');
		state.setLayers([FINE]);

		expect(state.getCurrentLayerId()).toBe('1');
	});

	it('has no layer at all when the graph is empty', () => {
		state.setLayers([]);

		expect(state.getCurrentLayerId()).toBeNull();
		expect(selected(state)).toEqual([]);
		expect(state.selectedSpans()).toEqual([]);
	});
});

describe('graph → manuscript', () => {
	let state: GraphViewState;

	beforeEach(() => {
		state = new GraphViewState();
		state.setLayers(LAYERS);
	});

	it('selecting a node reports its lines', () => {
		expect(state.selectNode('5')).toBe(true);

		expect(selected(state)).toEqual(['5']);
		expect(state.selectedSpans()).toEqual([{ start: 16, end: 17 }]);
	});

	it('selecting replaces the previous selection rather than adding to it', () => {
		state.selectNode('5');
		state.selectNode('1');

		expect(selected(state)).toEqual(['1']);
		expect(state.selectedSpans()).toEqual([{ start: 3, end: 5 }]);
	});

	it('ignores a node id that is not in the layer on screen', () => {
		// '6' exists in the fine layer but not the coarse one.
		state.switchTo('2');

		expect(state.selectNode('6')).toBe(false);
		expect(selected(state)).toEqual([]);
	});

	it('resolves the node id against the current layer, not another one', () => {
		state.switchTo('2');
		state.selectNode('1');

		// Node 1 is "introduction" here, not "knocking at the door".
		expect(state.selectedSpans()).toEqual([{ start: 1, end: 11 }]);
	});
});

describe('manuscript → graph', () => {
	let state: GraphViewState;

	beforeEach(() => {
		state = new GraphViewState();
		state.setLayers(LAYERS);
	});

	it('lights up every node covering the cursor line', () => {
		// Line 3 sits in node 1 (3-5) and node 3 (3-3).
		state.applyActive(activeFor(3, 3));

		expect(active(state)).toEqual(['1', '3']);
	});

	it('lights up every node a dragged selection touches', () => {
		state.switchTo('1');
		state.applyActive(activeFor(9, 11));

		// Nodes 2 (5-11) and 4 (9-11) both overlap lines 9-11.
		expect(active(state)).toEqual(['2', '4']);
	});

	it('lights up nothing when the selection falls outside every node', () => {
		state.applyActive(activeFor(12, 13));

		expect(active(state)).toEqual([]);
	});

	it('keeps each layer’s matches apart despite repeating node ids', () => {
		state.applyActive(activeFor(3, 3));
		expect(active(state)).toEqual(['1', '3']);

		state.switchTo('2');
		// Line 3 is inside "introduction" (1-11) only.
		expect(active(state)).toEqual(['1']);
	});
});

describe('the two directions are mutually exclusive', () => {
	let state: GraphViewState;

	beforeEach(() => {
		state = new GraphViewState();
		state.setLayers(LAYERS);
	});

	it('clicking a node clears what the manuscript had lit up', () => {
		state.applyActive(activeFor(3, 3));
		expect(active(state)).toEqual(['1', '3']);

		state.selectNode('5');

		expect(selected(state)).toEqual(['5']);
		expect(active(state)).toEqual([]);
	});

	it('moving in the manuscript clears the clicked node', () => {
		state.selectNode('5');
		state.applyActive(activeFor(3, 3));

		expect(selected(state)).toEqual([]);
		expect(active(state)).toEqual(['1', '3']);
	});

	it('a graph reload keeps the clicked node, since it is not the user picking a side', () => {
		state.selectNode('5');
		state.applyActive(activeFor(3, 3), true);

		expect(selected(state)).toEqual(['5']);
		expect(active(state)).toEqual(['1', '3']);
	});

	it('clearing the selection also discards the anchor', () => {
		state.selectNode('5');
		state.applyActive(activeFor(3, 3));

		// With no anchor left, switching layers must not resurrect a selection.
		state.switchTo('2');
		expect(selected(state)).toEqual([]);
	});
});

describe('selection carried between layers', () => {
	let state: GraphViewState;

	beforeEach(() => {
		state = new GraphViewState();
		state.setLayers(LAYERS);
	});

	it('carries a fine node up to the coarse node containing it', () => {
		state.selectNode('5'); // "sarah calling michael", 16-17
		state.switchTo('2');

		expect(selected(state)).toEqual(['2']); // "investigation", 14-21
		expect(state.selectedSpans()).toEqual([{ start: 14, end: 21 }]);
	});

	it('carries a coarse node down to every fine node it overlaps', () => {
		state.switchTo('2');
		state.selectNode('1'); // "introduction", 1-11
		state.switchTo('1');

		expect(selected(state)).toEqual(['1', '2', '3', '4']);
	});

	it('reports the lines of all of them when carrying downward', () => {
		state.switchTo('2');
		state.selectNode('2'); // "investigation", 14-21
		state.switchTo('1');

		expect(state.selectedSpans()).toEqual([
			{ start: 16, end: 17 },
			{ start: 17, end: 21 },
		]);
	});

	it('does not accumulate — round trips are idempotent', () => {
		state.selectNode('5');
		const once = selected(state);

		state.switchTo('2');
		state.switchTo('1');
		const twice = selected(state);

		state.switchTo('2');
		state.switchTo('1');
		expect(selected(state)).toEqual(twice);

		// Node 6 (17-21) shares line 17 with node 5 (16-17), so it comes along on the
		// first derivation — but the set must then stay put rather than growing.
		expect(once).toEqual(['5']);
		expect(twice).toEqual(['5', '6']);
	});

	it('always derives from the anchor, never from the previous layer’s result', () => {
		state.selectNode('3'); // 3-3, the narrowest node in the graph
		expect(state.getAnchor()).toEqual([{ start: 3, end: 3 }]);

		state.switchTo('2');
		state.switchTo('1');
		state.switchTo('2');

		// The anchor is still the single line the user picked.
		expect(state.getAnchor()).toEqual([{ start: 3, end: 3 }]);
	});

	it('selects nothing in a layer the anchor misses entirely', () => {
		state.selectNode('5'); // 16-17
		state.setLayers([FINE, COARSE, { id: '3', nodes: [node('x', 1, 2)], edges: [] }]);
		state.switchTo('3');

		expect(selected(state)).toEqual([]);
		expect(state.selectedSpans()).toEqual([]);
	});

	it('carries the selection across a graph reload too', () => {
		state.selectNode('5');
		state.setLayers(LAYERS);

		expect(selected(state)).toEqual(['5', '6']);
	});
});

/**
 * Carrying upward can land on more than one node, the same way carrying downward
 * does. The real data never shows it — its coarse nodes leave a gap at lines
 * 12-13 that no fine node crosses — so these use purpose-built layers.
 */
describe('carrying upward onto several nodes', () => {
	const FINE_SPLIT: Layer = {
		id: '1',
		nodes: [
			node('before', 1, 4),
			node('straddling', 8, 13),
			node('between', 11, 12),
			node('after', 18, 20),
		],
		edges: [],
	};

	/** Two halves with a clean boundary: nothing shared, nothing skipped. */
	const COARSE_SPLIT: Layer = {
		id: '2',
		nodes: [node('first', 1, 10), node('second', 11, 20)],
		edges: [],
	};

	/** Two halves that share line 10. */
	const COARSE_TOUCHING: Layer = {
		id: '2',
		nodes: [node('first', 1, 10), node('second', 10, 20)],
		edges: [],
	};

	/** Two halves with lines 11-13 belonging to neither. */
	const COARSE_GAPPED: Layer = {
		id: '2',
		nodes: [node('first', 1, 10), node('second', 14, 20)],
		edges: [],
	};

	const stateWith = (coarse: Layer) => {
		const state = new GraphViewState();
		state.setLayers([FINE_SPLIT, coarse]);
		return state;
	};

	it('selects both coarse nodes when a fine node crosses the boundary', () => {
		const state = stateWith(COARSE_SPLIT);
		state.selectNode('straddling'); // 8-13, across the 10/11 divide
		state.switchTo('2');

		expect(selected(state)).toEqual(['first', 'second']);
	});

	it('reports the lines of both of them to the manuscript', () => {
		const state = stateWith(COARSE_SPLIT);
		state.selectNode('straddling');
		state.switchTo('2');

		expect(state.selectedSpans()).toEqual([
			{ start: 1, end: 10 },
			{ start: 11, end: 20 },
		]);
	});

	it('selects both when the fine node only touches a shared boundary line', () => {
		const state = stateWith(COARSE_TOUCHING);
		state.selectNode('between'); // 11-12, inside "second" only
		state.switchTo('2');
		expect(selected(state)).toEqual(['second']);

		// 8-13 reaches line 10, which both coarse nodes claim.
		state.switchTo('1');
		state.selectNode('straddling');
		state.switchTo('2');
		expect(selected(state)).toEqual(['first', 'second']);
	});

	it('selects nothing when the fine node sits in the gap between coarse nodes', () => {
		const state = stateWith(COARSE_GAPPED);
		state.selectNode('between'); // 11-12, claimed by neither coarse node
		state.switchTo('2');

		expect(selected(state)).toEqual([]);
		expect(state.selectedSpans()).toEqual([]);
	});

	it('still selects just one when the fine node sits wholly inside a coarse node', () => {
		const state = stateWith(COARSE_SPLIT);
		state.selectNode('before'); // 1-4, inside "first" only
		state.switchTo('2');

		expect(selected(state)).toEqual(['first']);
	});

	it('widens on the round trip back down, as overlap dictates', () => {
		const state = stateWith(COARSE_SPLIT);
		state.selectNode('before'); // 1-4
		state.switchTo('2'); // -> "first", 1-10
		state.switchTo('1');

		// The anchor is still 1-4, so only nodes overlapping those lines return.
		expect(state.getAnchor()).toEqual([{ start: 1, end: 4 }]);
		expect(selected(state)).toEqual(['before']);
	});
});

describe('editing the graph', () => {
	let state: GraphViewState;

	const currentLayer = (s: GraphViewState) => s.getLayers().find((l) => l.id === s.getCurrentLayerId());

	beforeEach(() => {
		state = new GraphViewState();
		state.setLayers(LAYERS);
	});

	it('adds a node to the layer on screen and returns its id', () => {
		const id = state.addNode({ title: 'new', start: 8, end: 9 });

		expect(currentLayer(state)?.nodes.find((n) => n.id === id)?.title).toBe('new');
	});

	it('starts a first layer when the graph is empty', () => {
		state.setLayers([]);
		const id = state.addNode({ title: 'first', start: 1, end: 1 });

		expect(state.getCurrentLayerId()).not.toBeNull();
		expect(currentLayer(state)?.nodes.find((n) => n.id === id)?.title).toBe('first');
	});

	it('edits a node in place, and the new lines drive the selection', () => {
		state.selectNode('1'); // 3-5
		state.updateNode('1', { title: 'renamed', start: 2, end: 8, group: 4 });

		const n = currentLayer(state)?.nodes.find((x) => x.id === '1');
		expect([n?.title, n?.start, n?.end, n?.group]).toEqual(['renamed', 2, 8, 4]);
	});

	it('deletes a node and its edges, re-deriving the selection', () => {
		state.deleteNode('1');

		const layer = currentLayer(state);
		expect(layer?.nodes.some((n) => n.id === '1')).toBe(false);
		expect(layer?.edges.every((e) => e.from !== '1' && e.to !== '1')).toBe(true);
	});

	it('adds and removes edges on the current layer', () => {
		const before = currentLayer(state)?.edges.length ?? 0;

		state.addEdge('1', '4');
		expect(currentLayer(state)?.edges.length).toBe(before + 1);

		state.deleteEdgeAt((currentLayer(state)?.edges.length ?? 1) - 1);
		expect(currentLayer(state)?.edges.length).toBe(before);
	});

	it('touches only the layer on screen, despite repeating node ids', () => {
		state.switchTo('2');
		state.addNode({ title: 'coarse only', start: 5, end: 6 });

		const fine = state.getLayers().find((l) => l.id === '1');
		const coarse = state.getLayers().find((l) => l.id === '2');
		expect(coarse?.nodes.some((n) => n.title === 'coarse only')).toBe(true);
		expect(fine?.nodes.some((n) => n.title === 'coarse only')).toBe(false);
	});

	it('pins a batch of nodes at once, leaving the rest free', () => {
		state.pinPositions(
			new Map([
				['1', { x: 10, y: 20 }],
				['3', { x: 30, y: 40 }],
			])
		);

		const layer = currentLayer(state)!;
		expect(layer.nodes.find((n) => n.id === '1')).toMatchObject({ x: 10, y: 20 });
		expect(layer.nodes.find((n) => n.id === '3')).toMatchObject({ x: 30, y: 40 });
		expect(layer.nodes.find((n) => n.id === '2')?.x).toBeUndefined();
	});
});
