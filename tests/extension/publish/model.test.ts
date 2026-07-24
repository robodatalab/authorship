import { describe, expect, it } from 'vitest';

import {
	DEFAULT_SETTINGS,
	blurbPathFor,
	pubPathFor,
	readFields,
} from '../../../extension/publish/model';

describe('pubPathFor / blurbPathFor — the publication files beside the manuscript', () => {
	it('story.md resolves to story.pub.yaml and story.blurb.md in the same directory', () => {
		expect(pubPathFor('/work/data/story.md')).toBe('/work/data/story.pub.yaml');
		expect(blurbPathFor('/work/data/story.md')).toBe('/work/data/story.blurb.md');
	});

	it('matches the extension case-insensitively', () => {
		expect(pubPathFor('/work/STORY.MD')).toBe('/work/STORY.pub.yaml');
		expect(blurbPathFor('/work/STORY.MD')).toBe('/work/STORY.blurb.md');
	});

	it('only the trailing extension is replaced', () => {
		expect(pubPathFor('/work/notes.md/chapter.md')).toBe('/work/notes.md/chapter.pub.yaml');
	});
});

describe('readFields — the fields the form is allowed to change', () => {
	it('keeps title, author and language', () => {
		expect(readFields({ title: 'T', author: 'A', language: 'fr' })).toEqual({
			title: 'T',
			author: 'A',
			language: 'fr',
		});
	});

	it('ignores everything else — the cover is set through a dialog, not typed', () => {
		const fields = readFields({ title: 'T', cover: '/somewhere/else.png', extra: 1 });
		expect(fields).not.toHaveProperty('cover');
		expect(fields).toEqual({ title: 'T', author: '', language: '' });
	});

	it('coerces missing or non-string values to empty strings', () => {
		expect(readFields({})).toEqual({ title: '', author: '', language: '' });
		expect(readFields(null)).toEqual({ title: '', author: '', language: '' });
		expect(readFields({ title: 42 })).toEqual({ title: '42', author: '', language: '' });
	});
});

describe('DEFAULT_SETTINGS', () => {
	it('defaults the language to en and leaves the rest blank', () => {
		expect(DEFAULT_SETTINGS).toEqual({ title: '', author: '', language: 'en', cover: '' });
	});
});
