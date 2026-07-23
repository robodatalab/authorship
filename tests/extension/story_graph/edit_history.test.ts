import { beforeEach, describe, expect, it } from 'vitest';

import { EditHistory } from '../../../extension/story_graph/edit_history';
import type { Layer } from '../../../extension/story_graph/model';

/** A one-layer graph with a node per title, enough to tell states apart. */
const graph = (...titles: string[]): Layer[] => [
	{
		id: '1',
		nodes: titles.map((title, index) => ({
			id: String(index + 1),
			title,
			start: index + 1,
			end: index + 1,
		})),
		edges: [],
	},
];

const titles = (layers: Layer[] | null) => layers?.[0].nodes.map((node) => node.title);

describe('EditHistory', () => {
	let history: EditHistory;

	beforeEach(() => {
		history = new EditHistory();
		history.sync(graph('a')); // the initial load sets the baseline
	});

	it('has nothing to undo or redo at first', () => {
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);
	});

	it('undoes to the state before the edit', () => {
		history.commit(graph('a', 'b'));
		expect(history.canUndo()).toBe(true);

		expect(titles(history.undo())).toEqual(['a']);
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(true);
	});

	it('redoes to the state after the edit', () => {
		history.commit(graph('a', 'b'));
		history.undo();

		expect(titles(history.redo())).toEqual(['a', 'b']);
		expect(history.canRedo()).toBe(false);
	});

	it('walks a chain of edits back and forth', () => {
		history.commit(graph('a', 'b'));
		history.commit(graph('a', 'b', 'c'));

		expect(titles(history.undo())).toEqual(['a', 'b']);
		expect(titles(history.undo())).toEqual(['a']);
		expect(history.undo()).toBeNull();

		expect(titles(history.redo())).toEqual(['a', 'b']);
		expect(titles(history.redo())).toEqual(['a', 'b', 'c']);
		expect(history.redo()).toBeNull();
	});

	it('a fresh edit after an undo cuts the redo branch', () => {
		history.commit(graph('a', 'b'));
		history.undo();
		history.commit(graph('a', 'x'));

		expect(history.canRedo()).toBe(false);
		expect(titles(history.undo())).toEqual(['a']);
	});

	it('an unchanged commit is not a new undo point', () => {
		history.commit(graph('a'));
		expect(history.canUndo()).toBe(false);
	});

	it('keeps the history when our own write lands back', () => {
		history.commit(graph('a', 'b'));
		history.sync(graph('a', 'b')); // the file watcher echoing our save

		expect(history.canUndo()).toBe(true);
		expect(titles(history.undo())).toEqual(['a']);
	});

	it('clears the history when the file is rewritten underneath us', () => {
		history.commit(graph('a', 'b'));
		history.sync(graph('rebuilt')); // a background build wrote something else

		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);
	});

	it('recognizes its own writes even when a burst of undos echoes back late', () => {
		history.commit(graph('a', 'b'));
		history.commit(graph('a', 'b', 'c'));

		// Two quick undos, before either write is echoed back.
		history.undo(); // ['a', 'b']
		history.undo(); // ['a']

		// The echoes arrive afterwards; each is one of our own writes, so history
		// must survive them rather than mistaking a lagging echo for an edit.
		history.sync(graph('a', 'b'));
		history.sync(graph('a'));

		expect(history.canRedo()).toBe(true);
		expect(titles(history.redo())).toEqual(['a', 'b']);
	});

	it('hands back copies, so mutating a restored state can’t corrupt the stack', () => {
		history.commit(graph('a', 'b'));

		const undone = history.undo(); // ['a']
		undone?.[0].nodes.push({ id: '9', title: 'z', start: 9, end: 9 });
		history.redo(); // ['a', 'b']

		// Undoing again must yield the pristine ['a'], not the mutated copy.
		expect(titles(history.undo())).toEqual(['a']);
	});
});
