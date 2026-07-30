import { describe, expect, it } from 'vitest';

import {
	LABEL_LIMIT,
	afterEdits,
	normalize,
	progress,
	rowDescription,
	rowLabel,
	type Hit,
} from '../../../extension/search/model';

function hit(fields: Partial<Hit> = {}): Hit {
	return { start: 0, end: 0, score: 0.5, text: 'she poured the tea', ...fields };
}

describe('normalize — what the server answered, read into rows', () => {
	it('keeps the passages as they came', () => {
		expect(
			normalize({
				hits: [{ start: 4, end: 6, score: 0.71, text: 'the gate swung shut' }],
				pending: 3,
			})
		).toEqual({
			hits: [{ start: 4, end: 6, score: 0.71, text: 'the gate swung shut' }],
			pending: 3,
		});
	});

	it('an answer with nothing left to encode is not pending', () => {
		expect(normalize({ hits: [], pending: 0 }).pending).toBe(0);
	});

	it('drops a passage whose lines are not numbers', () => {
		const results = normalize({ hits: [{ start: 'four', end: 6 }, { start: 1, end: 1 }] });
		expect(results.hits).toHaveLength(1);
		expect(results.hits[0].start).toBe(1);
	});

	it('drops a passage that runs backwards — it says nothing about which lines were meant', () => {
		expect(normalize({ hits: [{ start: 9, end: 4 }] }).hits).toEqual([]);
	});

	it('a body holding nothing usable reads as no answer at all', () => {
		expect(normalize(null)).toEqual({ hits: [], pending: 0 });
		expect(normalize({})).toEqual({ hits: [], pending: 0 });
		expect(normalize({ hits: 'lots' })).toEqual({ hits: [], pending: 0 });
	});
});

describe('rowLabel — the passage on a single line', () => {
	it('shows a short passage as it stands', () => {
		expect(rowLabel(hit({ text: 'she poured the tea' }))).toBe('she poured the tea');
	});

	it('runs the paragraph breaks inside a passage together into spaces', () => {
		expect(rowLabel(hit({ text: 'the gate swung shut\n\nand she waited' }))).toBe(
			'the gate swung shut and she waited'
		);
	});

	it('cuts a passage too long for the row', () => {
		const label = rowLabel(hit({ text: 'gate '.repeat(80) }));
		expect(label.length).toBeLessThanOrEqual(LABEL_LIMIT);
		expect(label.endsWith('…')).toBe(true);
	});

	it('leaves a passage exactly as long as the row uncut', () => {
		const label = rowLabel(hit({ text: 'g'.repeat(LABEL_LIMIT) }));
		expect(label).toHaveLength(LABEL_LIMIT);
		expect(label.endsWith('…')).toBe(false);
	});
});

describe('rowDescription — where the passage is', () => {
	it('counts from one, as the editor gutter does', () => {
		expect(rowDescription(hit({ start: 0, end: 0 }))).toBe('line 1');
	});

	it('a passage of one line is a line, not a range', () => {
		expect(rowDescription(hit({ start: 41, end: 41 }))).toBe('line 42');
	});

	it('a passage of several lines carries both ends', () => {
		expect(rowDescription(hit({ start: 41, end: 43 }))).toBe('lines 42–44');
	});
});

describe('progress — what the drawer says while the server is still encoding', () => {
	it('says nothing once there is nothing left to encode', () => {
		expect(progress(0)).toBe('');
	});

	it('says how much is left, so a thin answer reads as unfinished', () => {
		expect(progress(120)).toBe('Encoding the manuscript — 120 lines to go');
	});

	it('counts a single line as a line', () => {
		expect(progress(1)).toBe('Encoding the manuscript — 1 line to go');
	});
});

describe('afterEdits — results surviving the prose moving under them', () => {
	const results = [hit({ start: 4, end: 6 }), hit({ start: 20, end: 20 })];

	it('an edit below every result leaves them all where they are', () => {
		expect(afterEdits(results, [{ start: 40, end: 40, delta: 1 }])).toBe(results);
	});

	it('an edit above a result moves it down by the lines the document gained', () => {
		const after = afterEdits(results, [{ start: 0, end: 0, delta: 2 }]);
		expect(after.map((entry) => [entry.start, entry.end])).toEqual([
			[6, 8],
			[22, 22],
		]);
	});

	it('an edit above a result moves it up by the lines the document lost', () => {
		const after = afterEdits(results, [{ start: 0, end: 1, delta: -1 }]);
		expect(after.map((entry) => [entry.start, entry.end])).toEqual([
			[3, 5],
			[19, 19],
		]);
	});

	it('a result written into is dropped rather than carried forward wrong', () => {
		const after = afterEdits(results, [{ start: 5, end: 5, delta: 0 }]);
		expect(after.map((entry) => entry.start)).toEqual([20]);
	});

	it('an edit touching the first line of a result drops it', () => {
		expect(afterEdits(results, [{ start: 4, end: 4, delta: 0 }])).toHaveLength(1);
	});

	it('an edit touching the last line of a result drops it', () => {
		expect(afterEdits(results, [{ start: 6, end: 6, delta: 0 }])).toHaveLength(1);
	});

	it('a typed character between two results disturbs neither', () => {
		expect(afterEdits(results, [{ start: 10, end: 10, delta: 0 }])).toBe(results);
	});

	it('several edits in one event are applied against the document as it was', () => {
		// Both are expressed against the same original text, so they are worked
		// last-first and the earlier one's numbers still mean what they said.
		const after = afterEdits(results, [
			{ start: 0, end: 0, delta: 1 },
			{ start: 10, end: 10, delta: 1 },
		]);
		expect(after.map((entry) => entry.start)).toEqual([5, 22]);
	});

	it('the same array back when nothing moved, so a caller can tell', () => {
		expect(afterEdits(results, [])).toBe(results);
	});
});
