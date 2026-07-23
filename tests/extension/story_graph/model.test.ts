import { describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
	addEdge,
	addNode,
	deleteEdgeAt,
	deleteNode,
	denormalize,
	graphPathFor,
	mergeSpans,
	nodesTouching,
	normalize,
	spansOverlap,
	updateNode,
	type Layer,
} from '../../../extension/story_graph/model';

/** The shape currently in data/story_1.graph.yaml — two layers with repeating node ids. */
const TWO_LAYERS = `
layer:
  - id: 1
    nodes:
      - node: 1
        title: knocking at the door
        start: 3
        end: 5
      - node: 2
        title: checking
        start: 5
        end: 11
    edges:
      - edge: 1
        start: 1
        end: 2
  - id: 2
    nodes:
      - node: 1
        title: introduction
        start: 1
        end: 11
      - node: 2
        title: investigation
        start: 14
        end: 21
    edges:
      - edge: 1
        start: 1
        end: 2
`;

const layersFrom = (yaml: string) => normalize(parseYaml(yaml));

describe('normalize — graph file parsing', () => {
	it('reads a list of layers, keeping each layer separate', () => {
		const layers = layersFrom(TWO_LAYERS);

		expect(layers.map((layer) => layer.id)).toEqual(['1', '2']);
		expect(layers[0].nodes).toHaveLength(2);
		expect(layers[1].nodes).toHaveLength(2);
	});

	it('node ids may repeat across layers without colliding', () => {
		const layers = layersFrom(TWO_LAYERS);

		expect(layers[0].nodes.find((node) => node.id === '1')?.title).toBe('knocking at the door');
		expect(layers[1].nodes.find((node) => node.id === '1')?.title).toBe('introduction');
	});

	it('start/end on a node are line numbers, on an edge are node ids', () => {
		const [layer] = layersFrom(TWO_LAYERS);

		expect(layer.nodes.map((node) => [node.id, node.start, node.end])).toEqual([
			['1', 3, 5],
			['2', 5, 11],
		]);
		expect(layer.edges.map((edge) => [edge.from, edge.to])).toEqual([['1', '2']]);
	});

	it('accepts a single layer written as a mapping rather than a list', () => {
		const layers = layersFrom(`
layer:
  id: 7
  nodes:
    - node: 1
      title: only
      start: 1
      end: 2
`);

		expect(layers).toHaveLength(1);
		expect(layers[0].id).toBe('7');
		expect(layers[0].nodes[0].title).toBe('only');
	});

	it('layer id falls back to its position when absent', () => {
		const layers = layersFrom(`
layer:
  - nodes:
      - node: a
        title: first
        start: 1
        end: 1
  - nodes:
      - node: b
        title: second
        start: 2
        end: 2
`);

		expect(layers.map((layer) => layer.id)).toEqual(['1', '2']);
	});

	it('drops edges pointing at nodes that do not exist', () => {
		const [layer] = layersFrom(`
layer:
  - id: 1
    nodes:
      - node: 1
        title: real
        start: 1
        end: 2
    edges:
      - edge: 1
        start: 1
        end: 99
      - edge: 2
        start: 99
        end: 1
`);

		expect(layer.nodes).toHaveLength(1);
		expect(layer.edges).toEqual([]);
	});

	it('drops nodes with no id or unusable line numbers', () => {
		const [layer] = layersFrom(`
layer:
  - id: 1
    nodes:
      - node: 1
        title: keeps
        start: 1
        end: 2
      - title: no id at all
        start: 3
        end: 4
      - node: 3
        title: line numbers missing
`);

		expect(layer.nodes.map((node) => node.id)).toEqual(['1']);
	});

	it('drops layers that end up with no nodes', () => {
		const layers = layersFrom(`
layer:
  - id: 1
    nodes: []
  - id: 2
    nodes:
      - node: 1
        title: survives
        start: 1
        end: 1
`);

		expect(layers.map((layer) => layer.id)).toEqual(['2']);
	});

	it('survives empty and malformed input', () => {
		expect(normalize(undefined)).toEqual([]);
		expect(normalize(null)).toEqual([]);
		expect(normalize({})).toEqual([]);
		expect(normalize(parseYaml(''))).toEqual([]);
		expect(normalize(parseYaml('layer: []'))).toEqual([]);
	});
});

describe('graphPathFor — locating the graph beside the manuscript', () => {
	it('story_1.md resolves to story_1.graph.yaml in the same directory', () => {
		expect(graphPathFor('/work/data/story_1.md')).toBe('/work/data/story_1.graph.yaml');
	});

	it('matches the extension case-insensitively', () => {
		expect(graphPathFor('/work/STORY.MD')).toBe('/work/STORY.graph.yaml');
	});

	it('only the trailing extension is replaced', () => {
		expect(graphPathFor('/work/notes.md/chapter.md')).toBe('/work/notes.md/chapter.graph.yaml');
	});
});

describe('spansOverlap — the one rule tying the graph to the manuscript', () => {
	it('is true when the spans share several lines', () => {
		expect(spansOverlap({ start: 3, end: 8 }, { start: 5, end: 11 })).toBe(true);
	});

	it('is true when they share only a boundary line', () => {
		// Nodes routinely end where the next begins — node 5 is 16-17, node 6 is 17-21.
		expect(spansOverlap({ start: 16, end: 17 }, { start: 17, end: 21 })).toBe(true);
	});

	it('is true when one span contains the other', () => {
		expect(spansOverlap({ start: 1, end: 11 }, { start: 3, end: 3 })).toBe(true);
		expect(spansOverlap({ start: 3, end: 3 }, { start: 1, end: 11 })).toBe(true);
	});

	it('is false when they miss by a line', () => {
		expect(spansOverlap({ start: 3, end: 5 }, { start: 6, end: 9 })).toBe(false);
		expect(spansOverlap({ start: 6, end: 9 }, { start: 3, end: 5 })).toBe(false);
	});

	it('is symmetric', () => {
		const pairs = [
			[
				{ start: 1, end: 5 },
				{ start: 5, end: 9 },
			],
			[
				{ start: 1, end: 4 },
				{ start: 5, end: 9 },
			],
			[
				{ start: 2, end: 2 },
				{ start: 2, end: 2 },
			],
		] as const;

		for (const [a, b] of pairs) {
			expect(spansOverlap(a, b)).toBe(spansOverlap(b, a));
		}
	});

	it('treats a single line as a span of length one', () => {
		expect(spansOverlap({ start: 3, end: 3 }, { start: 3, end: 5 })).toBe(true);
		expect(spansOverlap({ start: 3, end: 3 }, { start: 4, end: 5 })).toBe(false);
	});
});

describe('nodesTouching — matching a layer against lines', () => {
	const FINE: Layer = {
		id: '1',
		nodes: [
			{ id: '1', title: 'knocking at the door', start: 3, end: 5 },
			{ id: '2', title: 'checking', start: 5, end: 11 },
			{ id: '3', title: 'preparing for a walk', start: 3, end: 3 },
			{ id: '4', title: 'sarah curious', start: 9, end: 11 },
		],
		edges: [],
	};

	it('returns every node covering a single line', () => {
		expect(nodesTouching(FINE, [{ start: 3, end: 3 }])).toEqual(['1', '3']);
	});

	it('returns every node a dragged span touches', () => {
		expect(nodesTouching(FINE, [{ start: 9, end: 11 }])).toEqual(['2', '4']);
	});

	it('unions several spans without repeating a node', () => {
		expect(
			nodesTouching(FINE, [
				{ start: 3, end: 3 },
				{ start: 4, end: 4 },
			])
		).toEqual(['1', '3']);
	});

	it('returns nothing for lines outside every node, or for no spans at all', () => {
		expect(nodesTouching(FINE, [{ start: 20, end: 25 }])).toEqual([]);
		expect(nodesTouching(FINE, [])).toEqual([]);
	});

	it('keeps the layer’s own node order', () => {
		expect(nodesTouching(FINE, [{ start: 1, end: 99 }])).toEqual(['1', '2', '3', '4']);
	});
});

describe('mergeSpans — painting the manuscript highlight', () => {
	it('merges spans that share a line', () => {
		// The real case: nodes 16-17 and 17-21 both cover line 17, and painting them
		// separately made line 17 read as a second selection.
		expect(mergeSpans([{ start: 16, end: 17 }, { start: 17, end: 21 }])).toEqual([
			{ start: 16, end: 21 },
		]);
	});

	it('leaves spans with a gap between them alone', () => {
		expect(mergeSpans([{ start: 3, end: 5 }, { start: 7, end: 9 }])).toEqual([
			{ start: 3, end: 5 },
			{ start: 7, end: 9 },
		]);
	});

	it('absorbs a span fully inside another', () => {
		expect(mergeSpans([{ start: 1, end: 11 }, { start: 4, end: 6 }])).toEqual([
			{ start: 1, end: 11 },
		]);
	});

	it('handles input that is not sorted', () => {
		expect(
			mergeSpans([{ start: 17, end: 21 }, { start: 16, end: 17 }, { start: 30, end: 31 }])
		).toEqual([
			{ start: 16, end: 21 },
			{ start: 30, end: 31 },
		]);
	});

	it('merges a chain of spans that overlap in sequence', () => {
		expect(
			mergeSpans([{ start: 1, end: 3 }, { start: 3, end: 6 }, { start: 6, end: 9 }])
		).toEqual([{ start: 1, end: 9 }]);
	});

	it('passes through the trivial cases', () => {
		expect(mergeSpans([])).toEqual([]);
		expect(mergeSpans([{ start: 4, end: 7 }])).toEqual([{ start: 4, end: 7 }]);
	});

	it('does not mutate the spans it is given', () => {
		const input = [{ start: 17, end: 21 }, { start: 16, end: 17 }];
		mergeSpans(input);

		expect(input).toEqual([
			{ start: 17, end: 21 },
			{ start: 16, end: 17 },
		]);
	});
});

describe('denormalize — writing the graph back', () => {
	const LAYERS = layersFrom(TWO_LAYERS);

	it('is the inverse of normalize', () => {
		expect(normalize(denormalize(LAYERS))).toEqual(LAYERS);
	});

	it('survives a round trip through YAML text', () => {
		const text = stringifyYaml(denormalize(LAYERS));
		expect(normalize(parseYaml(text))).toEqual(LAYERS);
	});

	it('keeps integer ids as integers, so node: 1 does not become node: "1"', () => {
		const doc = denormalize(LAYERS) as { layer: { id: unknown; nodes: { node: unknown }[] }[] };
		expect(doc.layer[0].id).toBe(1);
		expect(doc.layer[0].nodes[0].node).toBe(1);
	});

	it('renumbers edges by position, as the builder does', () => {
		const layer: Layer = {
			id: '1',
			nodes: [
				{ id: '1', title: 'a', start: 1, end: 1 },
				{ id: '2', title: 'b', start: 2, end: 2 },
				{ id: '3', title: 'c', start: 3, end: 3 },
			],
			edges: [
				{ id: 'x', from: '1', to: '2' },
				{ id: 'y', from: '2', to: '3' },
			],
		};
		const doc = denormalize([layer]) as { layer: { edges: { edge: number }[] }[] };
		expect(doc.layer[0].edges.map((edge) => edge.edge)).toEqual([1, 2]);
	});

	it('writes a group only when the node has one', () => {
		const layer: Layer = {
			id: '1',
			nodes: [
				{ id: '1', title: 'grouped', start: 1, end: 2, group: 3 },
				{ id: '2', title: 'ungrouped', start: 3, end: 4 },
			],
			edges: [],
		};
		const doc = denormalize([layer]) as { layer: { nodes: Record<string, unknown>[] }[] };
		expect(doc.layer[0].nodes[0]).toHaveProperty('group', 3);
		expect(doc.layer[0].nodes[1]).not.toHaveProperty('group');
	});
});

describe('graph edits', () => {
	const base: Layer = {
		id: '1',
		nodes: [
			{ id: '1', title: 'a', start: 1, end: 2 },
			{ id: '2', title: 'b', start: 3, end: 4 },
		],
		edges: [{ id: '1', from: '1', to: '2' }],
	};

	it('adds a node with the next free integer id', () => {
		const { layer, id } = addNode(base, { title: 'c', start: 5, end: 6 });

		expect(id).toBe('3');
		expect(layer.nodes.map((n) => n.id)).toEqual(['1', '2', '3']);
	});

	it('overwrites a node’s fields whole, so the group can be cleared', () => {
		const set = updateNode(base, '1', { title: 'A', start: 10, end: 12, group: 2 });
		expect(set.nodes.find((n) => n.id === '1')).toEqual({
			id: '1',
			title: 'A',
			start: 10,
			end: 12,
			group: 2,
		});

		const cleared = updateNode(set, '1', { title: 'A', start: 10, end: 12 });
		expect(cleared.nodes.find((n) => n.id === '1')?.group).toBeUndefined();
	});

	it('deleting a node also drops every edge touching it', () => {
		const layer = deleteNode(base, '1');

		expect(layer.nodes.map((n) => n.id)).toEqual(['2']);
		expect(layer.edges).toEqual([]);
	});

	it('adds an edge, keeping the one already there', () => {
		const layer = addEdge(base, '2', '1');

		expect(layer.edges.map((e) => [e.from, e.to])).toEqual([
			['1', '2'],
			['2', '1'],
		]);
	});

	it('refuses a self-loop, an unknown endpoint, or a duplicate edge', () => {
		expect(addEdge(base, '1', '1').edges).toHaveLength(1);
		expect(addEdge(base, '1', '9').edges).toHaveLength(1);
		expect(addEdge(base, '1', '2').edges).toHaveLength(1);
	});

	it('deletes an edge by position, and leaves an out-of-range index alone', () => {
		expect(deleteEdgeAt(base, 0).edges).toEqual([]);
		expect(deleteEdgeAt(base, 5)).toBe(base);
	});

	it('does not mutate the layer it is handed', () => {
		addNode(base, { title: 'c', start: 5, end: 6 });
		updateNode(base, '1', { title: 'A', start: 1, end: 1 });
		deleteNode(base, '1');
		addEdge(base, '2', '1');
		deleteEdgeAt(base, 0);

		expect(base.nodes).toHaveLength(2);
		expect(base.edges).toHaveLength(1);
	});
});
