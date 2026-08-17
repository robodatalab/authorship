import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PART_WORDS,
	countWords,
	furnitureOf,
	intoParts,
	partCells,
	partFileName,
	partNumber,
	partTitle,
	quotaOf,
	sectionsOf,
	type Section,
} from '../../../extension/parts/model';
import { chapter, markdown, type Cell } from '../../../extension/storydoc/model';

function titlePage(attrs: Record<string, string>): Cell {
	return { kind: 'title-page', source: '', attrs };
}

function cover(src: string): Cell {
	return { kind: 'cover', source: `![Cover](${src})`, attrs: { src } };
}

/** A section of a given weight, for a division that only cares what things weigh. */
function weighing(words: number, title = 'One'): Section {
	return { cells: [chapter(title)], words };
}

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

describe('sectionsOf — the sections a division cuts along', () => {
	it('makes a section of each chapter and the cells written under it', () => {
		const sections = sectionsOf([
			chapter('One'),
			markdown('alpha'),
			markdown('beta'),
			chapter('Two'),
			markdown('gamma'),
		]);
		expect(sections).toHaveLength(2);
		expect(sections[0].cells.map((cell) => cell.source)).toEqual(['', 'alpha', 'beta']);
		expect(sections[1].cells.map((cell) => cell.source)).toEqual(['', 'gamma']);
	});

	it('weighs the chapter title along with the prose beneath it', () => {
		const sections = sectionsOf([chapter('One'), markdown('alpha beta gamma')]);
		expect(sections[0].words).toBe(4);
	});

	it('a heading someone wrote in their prose is prose', () => {
		// The one thing cutting along `##` in flattened markdown could never get
		// right, and the reason a division reads cells.
		const sections = sectionsOf([chapter('One'), markdown('## Not A Chapter')]);
		expect(sections).toHaveLength(1);
	});

	it('cuts nothing from a story with no chapters at all', () => {
		expect(sectionsOf([markdown('alpha beta')])).toEqual([]);
	});

	it('leaves the furniture and the blurb out of the story', () => {
		const sections = sectionsOf([
			titlePage({ title: 'Veriona' }),
			chapter('One'),
			markdown('alpha'),
			{ kind: 'blurb', source: 'A woman loses her name.', attrs: {} },
			{ kind: 'about', source: 'A. Writer lives by the sea.', attrs: {} },
		]);
		expect(sections).toHaveLength(1);
		expect(sections[0].cells.map((cell) => cell.source)).toEqual(['', 'alpha']);
	});
});

describe('furnitureOf — what stands before the story and after it', () => {
	it('splits at the first chapter', () => {
		const { front, back } = furnitureOf([
			cover('cover.jpg'),
			titlePage({ title: 'Veriona' }),
			chapter('One'),
			markdown('alpha'),
			{ kind: 'about', source: 'A. Writer lives by the sea.', attrs: {} },
		]);
		expect(front.map((cell) => cell.kind)).toEqual(['cover', 'title-page']);
		expect(back.map((cell) => cell.kind)).toEqual(['about']);
	});

	it('a story with no chapters has all of its furniture in front', () => {
		const { front, back } = furnitureOf([titlePage({ title: 'V' }), markdown('a')]);
		expect(front.map((cell) => cell.kind)).toEqual(['title-page']);
		expect(back).toEqual([]);
	});

	it('takes nothing that is the story', () => {
		const { front, back } = furnitureOf([chapter('One'), markdown('alpha')]);
		expect(front).toEqual([]);
		expect(back).toEqual([]);
	});
});

describe('intoParts — filling each part with whole sections', () => {
	it('fills up to the quota', () => {
		const parts = intoParts([weighing(40), weighing(40), weighing(40)], 100);
		expect(parts.map((part) => part.words)).toEqual([80, 40]);
	});

	it('takes a section that overshoots by less than stopping would undershoot', () => {
		expect(intoParts([weighing(60), weighing(50)], 100).map((p) => p.words)).toEqual([110]);
	});

	it('leaves a section that would blow the quota to the next part', () => {
		expect(intoParts([weighing(60), weighing(90)], 100).map((p) => p.words)).toEqual([
			60, 90,
		]);
	});

	it('a section longer than the quota still gets a part, since there is nowhere smaller', () => {
		expect(intoParts([weighing(5000)], 100).map((part) => part.words)).toEqual([5000]);
	});

	it('nothing to divide makes no parts', () => {
		expect(intoParts([], 100)).toEqual([]);
	});

	it('every section lands in exactly one part, in the order it was written', () => {
		const sections = ['One', 'Two', 'Three', 'Four'].map((name) => weighing(70, name));
		const titles = intoParts(sections, 100).flatMap((part) =>
			part.sections.map((section) => section.cells[0].attrs.title)
		);
		expect(titles).toEqual(['One', 'Two', 'Three', 'Four']);
	});
});

describe('partCells — a part as a document of its own', () => {
	it('carries the furniture around its share of the story', () => {
		const cells = [
			cover('cover.jpg'),
			titlePage({ title: 'Veriona', subtitle: 'A Queendom drama' }),
			chapter('One'),
			markdown('alpha'),
			chapter('Two'),
			markdown('beta'),
			{ kind: 'about', source: 'A. Writer lives by the sea.', attrs: {} },
		];
		const parts = intoParts(sectionsOf(cells), 1);
		const second = partCells(furnitureOf(cells), 2, parts[1]);

		expect(second.map((cell) => cell.kind)).toEqual([
			'cover',
			'title-page',
			'chapter',
			'markdown',
			'about',
		]);
		expect(second[3].source).toBe('beta');
	});

	it('renumbers the title page, and leaves the subtitle as it stands', () => {
		const cells = [
			titlePage({ title: 'Veriona', subtitle: 'A Queendom drama' }),
			chapter('One'),
			markdown('alpha'),
		];
		const parts = intoParts(sectionsOf(cells), 5000);
		const only = partCells(furnitureOf(cells), 3, parts[0]);

		expect(only[0].attrs.title).toBe('Veriona — Part 3');
		expect(only[0].attrs.subtitle).toBe('A Queendom drama');
	});

	it('names the part alone when the story has no title', () => {
		expect(partTitle('', 4)).toBe('Part 4');
		expect(partTitle('Story', 4)).toBe('Story — Part 4');
	});

	it('points the cover at art that is now a folder away', () => {
		// The parts sit in `parts/`; the art did not move with them.
		const cells = [cover('art/cover.jpg'), chapter('One'), markdown('alpha')];
		const parts = intoParts(sectionsOf(cells), 5000);
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].attrs.src).toBe('../art/cover.jpg');
		expect(only[0].source).toBe('![Cover](../art/cover.jpg)');
	});

	it('leaves a cover that already says where its art is from', () => {
		for (const src of ['https://art.example/c.jpg', '/shared/art/c.jpg']) {
			const cells = [cover(src), chapter('One'), markdown('a')];
			const parts = intoParts(sectionsOf(cells), 5000);
			const only = partCells(furnitureOf(cells), 1, parts[0]);

			expect(only[0].attrs.src, src).toBe(src);
			expect(only[0].source, src).toBe(`![Cover](${src})`);
		}
	});

	it('moves a cover that names its art only in the markdown', () => {
		// What a cover written by hand looks like, and what the exporter falls back
		// to reading when there is no attribute to read.
		const cells = [
			{ kind: 'cover', source: '![Cover](art/c.jpg)', attrs: {} },
			chapter('One'),
			markdown('alpha'),
		];
		const parts = intoParts(sectionsOf(cells), 5000);
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].source).toBe('![Cover](../art/c.jpg)');
		expect(only[0].attrs).toEqual({});
	});

	it('climbs one further out of a path that already climbs', () => {
		// Written from where the story stands, so a part stands one folder deeper.
		const cells = [cover('../shared/c.jpg'), chapter('One'), markdown('a')];
		const parts = intoParts(sectionsOf(cells), 5000);
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].attrs.src).toBe('../../shared/c.jpg');
	});

	it('moves the path and not an alt text that happens to match it', () => {
		const cells = [
			{ kind: 'cover', source: '![c.jpg](c.jpg)', attrs: { src: 'c.jpg' } },
			chapter('One'),
			markdown('a'),
		];
		const parts = intoParts(sectionsOf(cells), 5000);
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].source).toBe('![c.jpg](../c.jpg)');
	});

	it('a story with no furniture is a part of nothing but chapters', () => {
		const cells = [chapter('One'), markdown('alpha')];
		const parts = intoParts(sectionsOf(cells), 5000);
		expect(partCells(furnitureOf(cells), 1, parts[0]).map((c) => c.kind)).toEqual([
			'chapter',
			'markdown',
		]);
	});
});

describe('partFileName / partNumber — the files a division owns', () => {
	it('writes the parts in the format the story is in', () => {
		expect(partFileName(1)).toBe('part_1.author');
		expect(partFileName(12)).toBe('part_12.author');
	});

	it('reads back which part a file it wrote holds', () => {
		expect(partNumber('part_1.author')).toBe(1);
		expect(partNumber('part_12.author')).toBe(12);
	});

	it('claims nothing else in the folder', () => {
		expect(partNumber('part_one.author')).toBeNull();
		expect(partNumber('notes.author')).toBeNull();
		expect(partNumber('part_1.author.bak')).toBeNull();
		expect(partNumber('draft_part_1.author')).toBeNull();
		expect(partNumber('part_1.md')).toBeNull();
	});

	it('orders a tenth part after a first, which the folder listing would not', () => {
		const names = ['part_10.author', 'part_1.author', 'part_2.author'];
		const sorted = [...names].sort((a, b) => partNumber(a)! - partNumber(b)!);
		expect(sorted).toEqual(['part_1.author', 'part_2.author', 'part_10.author']);
		expect([...names].sort()).toEqual([
			'part_1.author',
			'part_10.author',
			'part_2.author',
		]);
	});
});

describe('quotaOf — whatever the form reported, as a quota', () => {
	it('takes a length the author asked for', () => {
		expect(quotaOf(3000)).toBe(3000);
		expect(quotaOf('3000')).toBe(3000);
		expect(quotaOf(3000.7)).toBe(3000);
	});

	it('falls back on anything it could not divide by', () => {
		expect(quotaOf('')).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf(0)).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf(-100)).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf('many')).toBe(DEFAULT_PART_WORDS);
		expect(quotaOf(undefined)).toBe(DEFAULT_PART_WORDS);
	});
});
