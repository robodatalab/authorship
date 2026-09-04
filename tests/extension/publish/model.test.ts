import { describe, expect, it } from 'vitest';

import { authorshipPathFor } from '../../../extension/vscode_runtime/publish/model';

describe('authorshipPathFor — the book’s own document, beside the manuscript', () => {
	it('sits next to the manuscript it describes', () => {
		expect(authorshipPathFor('/work/data/story.md')).toBe(
			'/work/data/story.authorship.md'
		);
	});

	it('takes the extension off whatever case it was written in', () => {
		expect(authorshipPathFor('/work/STORY.MD')).toBe('/work/STORY.authorship.md');
	});

	it('only takes the extension off the end', () => {
		expect(authorshipPathFor('/work/notes.md/chapter.md')).toBe(
			'/work/notes.md/chapter.authorship.md'
		);
	});
});
