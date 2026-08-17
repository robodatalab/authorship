import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PART_WORDS,
	countWords,
	intoParts,
	mergeParts,
	partFileName,
	partNumber,
	partTitle,
	quotaOf,
	readManuscript,
	renderPart,
	titleWithoutPart,
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

describe('partFileName / partNumber — the files a division owns', () => {
	it('numbers the parts from one', () => {
		expect(partFileName(1)).toBe('part_1.md');
		expect(partFileName(12)).toBe('part_12.md');
	});

	it('reads back which part a file it wrote holds', () => {
		expect(partNumber('part_1.md')).toBe(1);
		expect(partNumber('part_12.md')).toBe(12);
	});

	it('claims nothing else in the folder', () => {
		expect(partNumber('part_one.md')).toBeNull();
		expect(partNumber('notes.md')).toBeNull();
		expect(partNumber('part_1.md.bak')).toBeNull();
		expect(partNumber('draft_part_1.md')).toBeNull();
	});

	it('orders a tenth part after a first, which the folder listing would not', () => {
		const names = ['part_10.md', 'part_1.md', 'part_2.md'];
		const sorted = [...names].sort((a, b) => partNumber(a)! - partNumber(b)!);
		expect(sorted).toEqual(['part_1.md', 'part_2.md', 'part_10.md']);
		expect([...names].sort()).toEqual(['part_1.md', 'part_10.md', 'part_2.md']);
	});
});

describe('titleWithoutPart — a manuscript title read back off a part', () => {
	it('is the inverse of partTitle', () => {
		expect(titleWithoutPart(partTitle('The Long Way', 3), 3)).toBe('The Long Way');
		expect(titleWithoutPart(partTitle('', 3), 3)).toBe('');
	});

	it('takes a heading the author wrote themselves at its word', () => {
		expect(titleWithoutPart('An Entirely New Name', 2)).toBe('An Entirely New Name');
	});

	it('only strips the number the part actually is', () => {
		expect(titleWithoutPart('The Long Way — Part 3', 2)).toBe('The Long Way — Part 3');
	});
});

describe('mergeParts — the parts put back together', () => {
	it('drops the part titles and takes back the one they were named for', () => {
		const merged = mergeParts([
			{ number: 1, text: '# The Long Way — Part 1\n\n## One\n\nalpha\n' },
			{ number: 2, text: '# The Long Way — Part 2\n\n## Two\n\nbeta\n' },
		]);
		expect(merged).toBe('# The Long Way\n\n## One\n\nalpha\n\n## Two\n\nbeta\n');
	});

	it('is the inverse of dividing, for a manuscript that carries no notes', () => {
		const manuscript = '# The Long Way\n\n## One\n\nalpha\n\n## Two\n\nbeta\n';
		const { title, sections } = readManuscript(manuscript);
		const written = intoParts(sections, 1).map((part, index) => ({
			number: index + 1,
			text: renderPart(title, index + 1, part),
		}));
		expect(written).toHaveLength(2);
		expect(mergeParts(written)).toBe(manuscript);
	});

	it('keeps a note the author left in a part — these are the files they write in', () => {
		const merged = mergeParts([
			{ number: 1, text: '# A Story — Part 1\n\n## One\n\nalpha <!-- rework -->\n' },
		]);
		expect(merged).toBe('# A Story\n\n## One\n\nalpha <!-- rework -->\n');
	});

	it('keeps a section the author added while the story was in parts', () => {
		const merged = mergeParts([
			{ number: 1, text: '# A Story — Part 1\n\n## One\n\nalpha\n\n## New\n\ngamma\n' },
			{ number: 2, text: '# A Story — Part 2\n\n## Two\n\nbeta\n' },
		]);
		expect(merged).toBe(
			'# A Story\n\n## One\n\nalpha\n\n## New\n\ngamma\n\n## Two\n\nbeta\n'
		);
	});

	it('leaves out a title altogether when the parts were never named for one', () => {
		const merged = mergeParts([
			{ number: 1, text: '# Part 1\n\n## One\n\nalpha\n' },
			{ number: 2, text: '# Part 2\n\n## Two\n\nbeta\n' },
		]);
		expect(merged).toBe('## One\n\nalpha\n\n## Two\n\nbeta\n');
	});

	it('carries a part with no title of its own straight through', () => {
		const merged = mergeParts([
			{ number: 1, text: '# A Story — Part 1\n\nalpha\n' },
			{ number: 2, text: 'beta\n' },
		]);
		expect(merged).toBe('# A Story\n\nalpha\n\nbeta\n');
	});

	it('passes over a part left empty rather than opening a gap for it', () => {
		const merged = mergeParts([
			{ number: 1, text: '# A Story — Part 1\n\nalpha\n' },
			{ number: 2, text: '# A Story — Part 2\n\n\n' },
			{ number: 3, text: '# A Story — Part 3\n\nbeta\n' },
		]);
		expect(merged).toBe('# A Story\n\nalpha\n\nbeta\n');
	});

	it('nothing at all merges to nothing', () => {
		expect(mergeParts([])).toBe('');
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
