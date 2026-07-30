import { describe, expect, it } from 'vitest';

import {
	LABEL_LIMIT,
	normalize,
	rowDescription,
	rowLabel,
	title,
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

describe('title — what the picker calls itself', () => {
	it('names the manuscript once there is nothing left to encode', () => {
		expect(title('story.md', 0)).toBe('Search story.md');
	});

	it('says how much is still being encoded, so a thin answer reads as unfinished', () => {
		expect(title('story.md', 120)).toBe('Search story.md — indexing, 120 lines to go');
	});

	it('counts a single line as a line', () => {
		expect(title('story.md', 1)).toBe('Search story.md — indexing, 1 line to go');
	});
});
