import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PART_WORDS,
	countWords,
	intoParts,
	isPartFile,
	partFileName,
	partTitle,
	quotaOf,
	readManuscript,
	renderPart,
} from '../../../extension/parts/model';

describe('countWords — words as a reader counts them', () => {
	it('counts whitespace-separated runs', () => {
		expect(countWords('It was a warm, sunny day.')).toBe(6);
	});

	it('ignores runs carrying neither letter nor digit', () => {
		expect(countWords('***')).toBe(0);
		expect(countWords('She stopped — and turned.')).toBe(4);
	});

	it('an empty line weighs nothing', () => {
		expect(countWords('')).toBe(0);
		expect(countWords('   ')).toBe(0);
	});
});

describe('readManuscript — the sections a division cuts along', () => {
	it('splits at ## headings and keeps the prose under each', () => {
		const { sections } = readManuscript('## One\nalpha beta\n\n## Two\ngamma');
		expect(sections.map((section) => section.heading)).toEqual(['## One', '## Two']);
		expect(sections[0].lines).toEqual(['alpha beta', '']);
		expect(sections[1].lines).toEqual(['gamma']);
	});

	it('counts the heading along with the prose beneath it, the ## marker aside', () => {
		const { sections } = readManuscript('## One\nalpha beta gamma');
		expect(sections[0].words).toBe(4);
	});

	it('takes the title as the manuscript name and out of the section holding it', () => {
		const { title, sections } = readManuscript('# The Long Way\n\n## One\nalpha');
		expect(title).toBe('The Long Way');
		expect(sections).toHaveLength(1);
		expect(sections[0].heading).toBe('## One');
	});

	it('keeps prose that opens the manuscript as a section of its own', () => {
		const { sections } = readManuscript('# Title\n\nalpha beta\n\n## One\ngamma');
		expect(sections[0].heading).toBeNull();
		expect(sections[0].words).toBe(2);
		expect(sections[1].heading).toBe('## One');
	});

	it('a manuscript with no headings is one section', () => {
		const { title, sections } = readManuscript('alpha beta gamma');
		expect(title).toBe('');
		expect(sections).toHaveLength(1);
		expect(sections[0].heading).toBeNull();
		expect(sections[0].words).toBe(3);
	});

	it('a heading inside a comment opens no section, and commented prose weighs nothing', () => {
		const { sections } = readManuscript(
			'## One\nalpha\n<!--\n## Not yet\nbeta gamma\n-->\ndelta'
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].words).toBe(3);
	});

	it('takes the notes out, so a part carries none of them', () => {
		const { sections } = readManuscript(
			'## One\nalpha\n<!--\n## Not yet\nbeta gamma\n-->\ndelta'
		);
		expect(sections[0].lines).toEqual(['alpha', 'delta']);
	});

	it('a line with prose beside a note keeps the prose', () => {
		const { sections } = readManuscript('## One\nalpha <!-- note --> beta\ngamma');
		expect(sections[0].lines).toEqual(['alpha  beta', 'gamma']);
	});

	it('trims the trailing space a note leaves, which markdown reads as a line break', () => {
		const { sections } = readManuscript('## One\nalpha <!-- note -->\nbeta');
		expect(sections[0].lines).toEqual(['alpha', 'beta']);
	});

	it('a note that was set apart by blank lines leaves the spacing the author had', () => {
		const { sections } = readManuscript('## One\nalpha\n\n<!-- note -->\n\nbeta');
		expect(sections[0].lines).toEqual(['alpha', '', 'beta']);
	});

	it('keeps a blank line the author doubled, which is a beat rather than a note', () => {
		const { sections } = readManuscript('## One\nalpha\n\n\n<!-- note -->\n\n\nbeta');
		expect(sections[0].lines).toEqual(['alpha', '', '', 'beta']);
	});

	it('a note with no blank line before it takes none away after', () => {
		const { sections } = readManuscript('## One\nalpha\n<!-- note -->\n\nbeta');
		expect(sections[0].lines).toEqual(['alpha', '', 'beta']);
	});
});

describe('intoParts — filling each part with whole sections', () => {
	it('fills up to the quota', () => {
		const sections = [
			{ heading: '## One', lines: [], words: 40 },
			{ heading: '## Two', lines: [], words: 40 },
			{ heading: '## Three', lines: [], words: 40 },
		];
		const parts = intoParts(sections, 100);
		expect(parts.map((part) => part.words)).toEqual([80, 40]);
	});

	it('takes a section that overshoots by less than stopping would undershoot', () => {
		const sections = [
			{ heading: '## One', lines: [], words: 60 },
			{ heading: '## Two', lines: [], words: 50 },
		];
		expect(intoParts(sections, 100).map((part) => part.words)).toEqual([110]);
	});

	it('leaves a section that would blow the quota to the next part', () => {
		const sections = [
			{ heading: '## One', lines: [], words: 60 },
			{ heading: '## Two', lines: [], words: 90 },
		];
		expect(intoParts(sections, 100).map((part) => part.words)).toEqual([60, 90]);
	});

	it('a section longer than the quota still gets a part, since there is nowhere smaller', () => {
		const sections = [{ heading: '## One', lines: [], words: 5000 }];
		expect(intoParts(sections, 100).map((part) => part.words)).toEqual([5000]);
	});

	it('nothing to divide makes no parts', () => {
		expect(intoParts([], 100)).toEqual([]);
	});

	it('every section lands in exactly one part, in the order it was written', () => {
		const sections = [
			{ heading: '## One', lines: [], words: 70 },
			{ heading: '## Two', lines: [], words: 70 },
			{ heading: '## Three', lines: [], words: 70 },
			{ heading: '## Four', lines: [], words: 70 },
		];
		const headings = intoParts(sections, 100).flatMap((part) =>
			part.sections.map((section) => section.heading)
		);
		expect(headings).toEqual(['## One', '## Two', '## Three', '## Four']);
	});
});

describe('renderPart — a part as its file reads', () => {
	it('opens with the manuscript title and the part number', () => {
		const part = { sections: [{ heading: '## One', lines: ['alpha'], words: 2 }], words: 2 };
		expect(renderPart('The Long Way', 3, part)).toBe(
			'# The Long Way — Part 3\n\n## One\nalpha\n'
		);
	});

	it('carries the sections in order, headings and all', () => {
		const part = {
			sections: [
				{ heading: '## One', lines: ['alpha'], words: 2 },
				{ heading: '## Two', lines: ['beta'], words: 2 },
			],
			words: 4,
		};
		expect(renderPart('Story', 1, part)).toBe(
			'# Story — Part 1\n\n## One\nalpha\n## Two\nbeta\n'
		);
	});

	it('a section with no heading contributes only its prose', () => {
		const part = { sections: [{ heading: null, lines: ['alpha'], words: 1 }], words: 1 };
		expect(renderPart('Story', 1, part)).toBe('# Story — Part 1\n\nalpha\n');
	});

	it('drops the blank lines a cut leaves at either end', () => {
		const part = {
			sections: [{ heading: null, lines: ['', '', 'alpha', '', ''], words: 1 }],
			words: 1,
		};
		expect(renderPart('Story', 2, part)).toBe('# Story — Part 2\n\nalpha\n');
	});

	it('names the part alone when the manuscript has no title', () => {
		expect(partTitle('', 4)).toBe('Part 4');
		expect(partTitle('Story', 4)).toBe('Story — Part 4');
	});
});

describe('partFileName / isPartFile — the files a division owns', () => {
	it('numbers the parts from one', () => {
		expect(partFileName(1)).toBe('part_1.md');
		expect(partFileName(12)).toBe('part_12.md');
	});

	it('recognizes what an earlier division wrote', () => {
		expect(isPartFile('part_1.md')).toBe(true);
		expect(isPartFile('part_12.md')).toBe(true);
	});

	it('claims nothing else in the folder', () => {
		expect(isPartFile('part_one.md')).toBe(false);
		expect(isPartFile('notes.md')).toBe(false);
		expect(isPartFile('part_1.md.bak')).toBe(false);
		expect(isPartFile('draft_part_1.md')).toBe(false);
	});
});

describe('quotaOf — whatever the form reported, as a quota', () => {
	it('takes a length the author can be divided by', () => {
		expect(quotaOf(3000)).toBe(3000);
		expect(quotaOf('3000')).toBe(3000);
		expect(quotaOf(3000.7)).toBe(3000);
	});

	it('falls back to the default rather than dividing by nothing', () => {
		expect(quotaOf('')).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf(0)).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf(-100)).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf('many')).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf(undefined)).toBe(DEFAULT_PART_WORDS);
	});
});
