import { describe, expect, it } from 'vitest';

import { GraphSelection } from '../../../extension/story_graph/graph_selection';

describe('GraphSelection — nodes', () => {
	it('a plain click selects just that node', () => {
		const s = new GraphSelection();
		s.clickNode('1', false);

		expect(s.hasNode('1')).toBe(true);
		expect(s.nodeIds()).toEqual(['1']);
	});

	it('a plain click replaces the previous selection', () => {
		const s = new GraphSelection();
		s.clickNode('1', false);
		s.clickNode('2', false);

		expect(s.nodeIds()).toEqual(['2']);
	});

	it('a modified click adds to the selection', () => {
		const s = new GraphSelection();
		s.clickNode('1', false);
		s.clickNode('2', true);

		expect(s.nodeIds().sort()).toEqual(['1', '2']);
	});

	it('a modified click on an already-selected node removes it', () => {
		const s = new GraphSelection();
		s.clickNode('1', false);
		s.clickNode('2', true);
		s.clickNode('1', true);

		expect(s.nodeIds()).toEqual(['2']);
	});
});

describe('GraphSelection — edges', () => {
	it('a plain click selects just that edge', () => {
		const s = new GraphSelection();
		s.clickEdge(2, false);

		expect(s.hasEdge(2)).toBe(true);
		expect(s.edgeIndices()).toEqual([2]);
	});

	it('a modified click adds and toggles edges', () => {
		const s = new GraphSelection();
		s.clickEdge(0, true);
		s.clickEdge(3, true);
		expect(s.edgeIndices()).toEqual([3, 0]);

		s.clickEdge(0, true);
		expect(s.edgeIndices()).toEqual([3]);
	});

	it('returns edge positions highest first, so deleting keeps the rest valid', () => {
		const s = new GraphSelection();
		s.clickEdge(1, true);
		s.clickEdge(4, true);
		s.clickEdge(2, true);

		expect(s.edgeIndices()).toEqual([4, 2, 1]);
	});
});

describe('GraphSelection — nodes and edges never mix', () => {
	it('selecting a node clears any selected edges', () => {
		const s = new GraphSelection();
		s.clickEdge(0, false);
		s.clickNode('1', false);

		expect(s.edgeIndices()).toEqual([]);
		expect(s.nodeIds()).toEqual(['1']);
	});

	it('selecting an edge clears any selected nodes', () => {
		const s = new GraphSelection();
		s.clickNode('1', true);
		s.clickNode('2', true);
		s.clickEdge(0, false);

		expect(s.nodeIds()).toEqual([]);
		expect(s.edgeIndices()).toEqual([0]);
	});

	it('even a modified edge click drops the nodes', () => {
		const s = new GraphSelection();
		s.clickNode('1', false);
		s.clickEdge(0, true);

		expect(s.nodeIds()).toEqual([]);
		expect(s.edgeIndices()).toEqual([0]);
	});
});

describe('GraphSelection — bookkeeping', () => {
	it('reports emptiness and whether any nodes are selected', () => {
		const s = new GraphSelection();
		expect(s.isEmpty()).toBe(true);
		expect(s.hasNodes()).toBe(false);

		s.clickNode('1', false);
		expect(s.isEmpty()).toBe(false);
		expect(s.hasNodes()).toBe(true);

		s.clickEdge(0, false);
		expect(s.isEmpty()).toBe(false);
		expect(s.hasNodes()).toBe(false); // an edge is selected, no nodes
	});

	it('only() selects a single node and drops the rest', () => {
		const s = new GraphSelection();
		s.clickNode('1', true);
		s.clickNode('2', true);
		s.only('3');

		expect(s.nodeIds()).toEqual(['3']);
	});

	it('removeNode drops one node, leaving the others', () => {
		const s = new GraphSelection();
		s.clickNode('1', true);
		s.clickNode('2', true);
		s.removeNode('1');

		expect(s.nodeIds()).toEqual(['2']);
	});

	it('clear empties everything', () => {
		const s = new GraphSelection();
		s.clickNode('1', true);
		s.clickEdge(0, true);
		s.clear();

		expect(s.isEmpty()).toBe(true);
	});
});

describe('GraphSelection — prune after a reload', () => {
	it('drops nodes whose id is gone', () => {
		const s = new GraphSelection();
		s.clickNode('1', true);
		s.clickNode('2', true);
		s.prune(new Set(['2']), 0);

		expect(s.nodeIds()).toEqual(['2']);
	});

	it('drops edge positions past the end of a shorter list', () => {
		const s = new GraphSelection();
		s.clickEdge(0, true);
		s.clickEdge(3, true);
		s.prune(new Set<string>(), 2); // only positions 0 and 1 still exist

		expect(s.edgeIndices()).toEqual([0]);
	});
});
