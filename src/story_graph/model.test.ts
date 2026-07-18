import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { graphPathFor, mergeSpans, normalize } from './model';

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
