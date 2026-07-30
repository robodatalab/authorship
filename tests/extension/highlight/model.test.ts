import { describe, expect, it } from 'vitest';

import { Claims, covers } from '../../../extension/highlight/model';

const STORY = 'file:///stories/story.md';
const OTHER = 'file:///stories/other.md';

describe('Claims — who is lighting up what', () => {
	it('a source gets back the spans it claimed', () => {
		const claims = new Claims();
		claims.claim('search', 'findings', STORY, [{ start: 4, end: 6 }]);
		expect(claims.spansIn('findings', STORY)).toEqual([{ start: 4, end: 6 }]);
	});

	it('the layers are independent — findings and focus describe the same lines from different distances', () => {
		const claims = new Claims();
		claims.claim('search', 'findings', STORY, [{ start: 4, end: 6 }]);
		claims.claim('search', 'focus', STORY, [{ start: 4, end: 4 }]);
		expect(claims.spansIn('findings', STORY)).toHaveLength(1);
		expect(claims.spansIn('focus', STORY)).toEqual([{ start: 4, end: 4 }]);
	});

	it('a newer claim displaces the one holding its layer, whoever made it', () => {
		const claims = new Claims();
		claims.claim('story-graph', 'focus', STORY, [{ start: 1, end: 2 }]);
		claims.claim('search', 'focus', STORY, [{ start: 9, end: 9 }]);
		expect(claims.spansIn('focus', STORY)).toEqual([{ start: 9, end: 9 }]);
		expect(claims.on('focus')?.source).toBe('search');
	});

	it('claiming nothing is a release, not a claim on no lines', () => {
		// A feature that found nothing this time must not go on holding the layer
		// against one that found something.
		const claims = new Claims();
		claims.claim('search', 'findings', STORY, [{ start: 4, end: 6 }]);
		claims.claim('search', 'findings', STORY, []);
		expect(claims.on('findings')).toBeUndefined();
	});

	it('a source releasing takes back only what it still holds', () => {
		// Tidying up after itself must not wipe a highlight another feature made
		// in the meantime.
		const claims = new Claims();
		claims.claim('story-graph', 'focus', STORY, [{ start: 1, end: 2 }]);
		claims.claim('search', 'focus', STORY, [{ start: 9, end: 9 }]);
		claims.release('story-graph');
		expect(claims.spansIn('focus', STORY)).toEqual([{ start: 9, end: 9 }]);
	});

	it('a source can release one layer and keep the other', () => {
		const claims = new Claims();
		claims.claim('search', 'findings', STORY, [{ start: 4, end: 6 }]);
		claims.claim('search', 'focus', STORY, [{ start: 4, end: 4 }]);
		claims.release('search', 'focus');
		expect(claims.spansIn('findings', STORY)).toHaveLength(1);
		expect(claims.on('focus')).toBeUndefined();
	});

	it('releasing everything a source holds takes both layers', () => {
		const claims = new Claims();
		claims.claim('search', 'findings', STORY, [{ start: 4, end: 6 }]);
		claims.claim('search', 'focus', STORY, [{ start: 4, end: 4 }]);
		claims.release('search');
		expect(claims.on('findings')).toBeUndefined();
		expect(claims.on('focus')).toBeUndefined();
	});

	it('a claim belongs to its document and draws in no other', () => {
		const claims = new Claims();
		claims.claim('search', 'findings', STORY, [{ start: 4, end: 6 }]);
		expect(claims.spansIn('findings', OTHER)).toEqual([]);
	});

	it('clearing a layer takes it from whoever holds it', () => {
		const claims = new Claims();
		claims.claim('story-graph', 'focus', STORY, [{ start: 1, end: 2 }]);
		claims.clear('focus');
		expect(claims.on('focus')).toBeUndefined();
	});

	it('the spans are copied, so a caller mutating its own list changes nothing here', () => {
		const claims = new Claims();
		const spans = [{ start: 4, end: 6 }];
		claims.claim('search', 'findings', STORY, spans);
		spans.push({ start: 100, end: 100 });
		expect(claims.spansIn('findings', STORY)).toHaveLength(1);
	});
});

describe('covers — whether a focus is still where the reader is', () => {
	it('a line inside a span is covered at either end and in the middle', () => {
		const span = [{ start: 4, end: 6 }];
		expect(covers(span, 4)).toBe(true);
		expect(covers(span, 5)).toBe(true);
		expect(covers(span, 6)).toBe(true);
	});

	it('a line outside every span is not covered', () => {
		expect(covers([{ start: 4, end: 6 }], 3)).toBe(false);
		expect(covers([{ start: 4, end: 6 }], 7)).toBe(false);
	});

	it('any span covering it is enough', () => {
		expect(covers([{ start: 0, end: 1 }, { start: 9, end: 9 }], 9)).toBe(true);
	});

	it('nothing claimed covers nothing', () => {
		expect(covers([], 0)).toBe(false);
	});
});
