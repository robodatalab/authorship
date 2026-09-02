import { describe, expect, it } from 'vitest';

import {
	furnitureOf,
	intoParts,
	partCells,
	partFileName,
	partNumber,
	partTitle,
	sectionsOf,
} from '../../../extension/parts/model';
import {
	chapter,
	markdown,
	part,
	printsPage,
	type Cell,
} from '../../../extension/storydoc/model';

function titlePage(attrs: Record<string, string>): Cell {
	return { kind: 'title-page', source: '', attrs };
}

function cover(src: string): Cell {
	return { kind: 'cover', source: `![Cover](${src})`, attrs: { src } };
}

/** A part that places a cut and prints no page: an author saying "break here"
 *  to the folder and to nobody else. */
function seam(title = 'Break'): Cell {
	return part(title, false);
}

/** Prose of a given length, for a story that has to look like one. */
function prose(words: number): Cell {
	return markdown(Array.from({ length: words }, () => 'word').join(' '));
}

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

	it('a heading someone wrote in their prose is prose', () => {
		// The one thing cutting along `##` in flattened markdown could never get
		// right, and the reason a division reads cells.
		const sections = sectionsOf([chapter('One'), markdown('## Not A Chapter')]);
		expect(sections).toHaveLength(1);
	});

	it('cuts nothing from a story with no chapters at all', () => {
		expect(sectionsOf([markdown('alpha beta')])).toEqual([]);
	});

	it('a part travels with the chapter it opens, not the one it stands after', () => {
		// The divider is printed above the chapters it names, so a cut made
		// between the two sections must leave it at the head of the second.
		const sections = sectionsOf([
			chapter('One'),
			markdown('alpha'),
			part('Day Two'),
			chapter('Two'),
			markdown('beta'),
		]);
		expect(sections[0].cells.map((cell) => cell.kind)).toEqual([
			'chapter',
			'markdown',
		]);
		expect(sections[1].cells.map((cell) => cell.kind)).toEqual([
			'part',
			'chapter',
			'markdown',
		]);
	});

	it('names the part every section stands in', () => {
		const sections = sectionsOf([
			part('Day One'),
			chapter('One'),
			chapter('Two'),
			part('Day Two'),
			chapter('Three'),
		]);
		expect(sections.map((section) => section.under)).toEqual([
			'Day One',
			'Day One',
			'Day Two',
		]);
	});

	it('a section written before the first part stands under none', () => {
		const sections = sectionsOf([
			chapter('Prologue'),
			part('Day One'),
			chapter('One'),
		]);
		expect(sections.map((section) => section.under)).toEqual(['', 'Day One']);
	});

	it('a story with no parts has every section standing under nothing', () => {
		const sections = sectionsOf([chapter('One'), markdown('alpha')]);
		expect(sections.map((section) => section.under)).toEqual(['']);
	});

	it('a seam leaves the name of the part it was cut inside where it was', () => {
		// The author breaking a long part in two has not started a new part of the
		// book, and the chapters after the break are still where they were.
		const sections = sectionsOf([
			part('Day One'),
			chapter('One'),
			seam(),
			chapter('Two'),
		]);
		expect(sections.map((section) => section.under)).toEqual([
			'Day One',
			'Day One',
		]);
	});

	it('a seam standing under no part of the book names nothing', () => {
		const sections = sectionsOf([chapter('One'), seam(), chapter('Two')]);
		expect(sections.map((section) => section.under)).toEqual(['', '']);
	});

	it('prose written between a part and its first chapter travels with the part', () => {
		// An epigraph under a part title belongs to the part, not to the chapter
		// that happened to come before it.
		const sections = sectionsOf([
			chapter('One'),
			markdown('alpha'),
			part('Day Two'),
			markdown('an epigraph'),
			chapter('Two'),
		]);
		expect(sections[0].cells.map((cell) => cell.source)).toEqual(['', 'alpha']);
		expect(sections[1].cells.map((cell) => cell.kind)).toEqual([
			'part',
			'markdown',
			'chapter',
		]);
	});

	it('a part with no chapter under it leaves what follows where it was written', () => {
		const sections = sectionsOf([
			chapter('One'),
			markdown('alpha'),
			part('Day Two'),
			markdown('beta'),
		]);
		expect(sections).toHaveLength(1);
		expect(sections[0].cells.map((cell) => cell.kind)).toEqual([
			'chapter',
			'markdown',
			'part',
			'markdown',
		]);
	});

	it('two parts in a row both open the chapter that follows them', () => {
		const sections = sectionsOf([part('Day One'), part('Day Two'), chapter('One')]);
		expect(sections).toHaveLength(1);
		expect(sections[0].cells.map((cell) => cell.attrs.title)).toEqual([
			'Day One',
			'Day Two',
			'One',
		]);
		expect(sections[0].under).toBe('Day Two');
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

	it('keeps a note with the chapter it was written under', () => {
		const sections = sectionsOf([
			chapter('One'),
			prose(10),
			{ kind: 'note', source: 'She has to find the letter here.', attrs: {} },
		]);
		expect(sections[0].cells.map((cell) => cell.kind)).toEqual([
			'chapter',
			'markdown',
			'note',
		]);
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

	it('takes no part of the story, not even the parts it is divided into', () => {
		// A part standing before the first chapter is still the story, and travels
		// with the chapters it names rather than with every part of the book.
		const { front } = furnitureOf([
			titlePage({ title: 'Veriona' }),
			part('Day One'),
			chapter('One'),
		]);
		expect(front.map((cell) => cell.kind)).toEqual(['title-page']);
	});
});

describe('intoParts — one file per Part the author marked', () => {
	it('cuts where a part stands', () => {
		const cells = [
			part('Day One'),
			chapter('One'),
			prose(10),
			part('Day Two'),
			chapter('Two'),
			prose(10),
		];
		const parts = intoParts(sectionsOf(cells));
		expect(parts).toHaveLength(2);
		expect(parts.map((held) => held.under)).toEqual(['Day One', 'Day Two']);
	});

	it('holds every chapter of a part in one file, however long it runs', () => {
		// Length has nothing to do with it any more: a part is a file because the
		// author said it is one.
		const cells = [
			part('Day One'),
			chapter('One'),
			prose(9000),
			chapter('Two'),
			prose(9000),
			part('Day Two'),
			chapter('Three'),
			prose(10),
		];
		const parts = intoParts(sectionsOf(cells));
		expect(parts.map((held) => held.sections.length)).toEqual([2, 1]);
	});

	it('a story with no parts at all divides into nothing', () => {
		// Nowhere was named as a place to break, and one file holding the whole
		// story is not a division of it.
		const cells = [chapter('One'), prose(10), chapter('Two'), prose(10)];
		expect(intoParts(sectionsOf(cells))).toEqual([]);
	});

	it('nothing to divide makes no parts', () => {
		expect(intoParts([])).toEqual([]);
	});

	it('a seam divides the files exactly as a printed part does', () => {
		const cells = [
			chapter('One'),
			prose(10),
			seam(),
			chapter('Two'),
			prose(10),
		];
		const parts = intoParts(sectionsOf(cells));
		expect(parts).toHaveLength(2);
	});

	it('a file cut at a seam stands under the part it was cut inside', () => {
		const cells = [
			part('Day One'),
			chapter('One'),
			prose(10),
			seam(),
			chapter('Two'),
			prose(10),
		];
		expect(intoParts(sectionsOf(cells)).map((held) => held.under)).toEqual([
			'Day One',
			'Day One',
		]);
	});

	it('the chapters written before the first part are a division of their own', () => {
		const cells = [
			chapter('Prologue'),
			prose(10),
			part('Day One'),
			chapter('One'),
			prose(10),
		];
		const parts = intoParts(sectionsOf(cells));
		expect(parts.map((held) => held.under)).toEqual(['', 'Day One']);
	});

	it('two parts the author gave the same name are still two parts', () => {
		const cells = [
			part('Day One'),
			chapter('One'),
			prose(10),
			part('Day One'),
			chapter('Two'),
			prose(10),
		];
		expect(intoParts(sectionsOf(cells))).toHaveLength(2);
	});

	it('every section lands in exactly one part, in the order it was written', () => {
		const cells = [
			chapter('Prologue'),
			prose(10),
			part('Day One'),
			chapter('One'),
			prose(10),
			seam(),
			chapter('Two'),
			prose(10),
			part('Day Two'),
			chapter('Three'),
			prose(10),
		];
		const titles = intoParts(sectionsOf(cells)).flatMap((held) =>
			held.sections.map(
				(section) => section.cells.find((cell) => cell.kind === 'chapter')!.attrs.title
			)
		);
		expect(titles).toEqual(['Prologue', 'One', 'Two', 'Three']);
	});

	it('numbers the files across the whole division, not within each part', () => {
		// Every part is one file in one folder, so the numbering is the folder's
		// and the name of the story's part is what tells them apart.
		const cells = [
			part('Day One'),
			chapter('One'),
			prose(10),
			seam(),
			chapter('Two'),
			prose(10),
			part('Day Two'),
			chapter('Three'),
			prose(10),
		];
		const named = intoParts(sectionsOf(cells)).map((held, at) =>
			partTitle('Veriona', at + 1, held.under)
		);
		expect(named).toEqual([
			'Veriona — Day One — Part 1',
			'Veriona — Day One — Part 2',
			'Veriona — Day Two — Part 3',
		]);
	});
});

describe('partCells — a part as a document of its own', () => {
	it('carries the furniture around its share of the story', () => {
		const cells = [
			cover('cover.jpg'),
			titlePage({ title: 'Veriona', subtitle: 'A Queendom drama' }),
			chapter('One'),
			markdown('alpha'),
			seam(),
			chapter('Two'),
			markdown('beta'),
			{ kind: 'about', source: 'A. Writer lives by the sea.', attrs: {} },
		];
		const parts = intoParts(sectionsOf(cells));
		const second = partCells(furnitureOf(cells), 2, parts[1]);

		expect(second.map((cell) => cell.kind)).toEqual([
			'cover',
			'title-page',
			'part',
			'chapter',
			'markdown',
			'about',
		]);
		expect(second[4].source).toBe('beta');
	});

	it('carries a note into the part its chapter went to, and no other', () => {
		const note: Cell = {
			kind: 'note',
			source: 'She has to find the letter here.',
			attrs: {},
		};
		const cells = [
			chapter('One'),
			prose(10),
			note,
			seam(),
			chapter('Two'),
			prose(10),
		];
		const parts = intoParts(sectionsOf(cells));

		expect(parts).toHaveLength(2);
		expect(partCells(furnitureOf(cells), 1, parts[0])).toContainEqual(note);
		expect(partCells(furnitureOf(cells), 2, parts[1])).not.toContainEqual(note);
	});

	it('renumbers the title page, and leaves the subtitle as it stands', () => {
		const cells = [
			titlePage({ title: 'Veriona', subtitle: 'A Queendom drama' }),
			seam(),
			chapter('One'),
			markdown('alpha'),
		];
		const parts = intoParts(sectionsOf(cells));
		const only = partCells(furnitureOf(cells), 3, parts[0]);

		expect(only[0].attrs.title).toBe('Veriona — Part 3');
		expect(only[0].attrs.subtitle).toBe('A Queendom drama');
	});

	it('names a part by the story, the part of it it came from, and its number', () => {
		expect(partTitle('Veriona', 3, 'Day One')).toBe('Veriona — Day One — Part 3');
		expect(partTitle('Story', 4)).toBe('Story — Part 4');
		expect(partTitle('', 2, 'Day One')).toBe('Day One — Part 2');
		expect(partTitle('', 4)).toBe('Part 4');
	});

	it('carries the name of the story’s part onto the title page', () => {
		const cells = [
			titlePage({ title: 'Veriona' }),
			part('Day One'),
			chapter('One'),
			prose(100),
			seam(),
			chapter('Two'),
			prose(100),
		];
		const parts = intoParts(sectionsOf(cells));
		const second = partCells(furnitureOf(cells), 2, parts[1]);

		expect(second[0].attrs.title).toBe('Veriona — Day One — Part 2');
	});

	it('opens each file with the part that cut it, and the printed one only once', () => {
		const cells = [
			titlePage({ title: 'Veriona' }),
			part('Day One'),
			chapter('One'),
			prose(100),
			seam(),
			chapter('Two'),
			prose(100),
		];
		const parts = intoParts(sectionsOf(cells));
		const furniture = furnitureOf(cells);

		// The divider is printed once, above the chapters it names. The file
		// carrying the rest of them opens with the seam that cut it — which is a
		// cell like any other and a page in no book.
		expect(partCells(furniture, 1, parts[0]).map((cell) => cell.kind)).toEqual([
			'title-page',
			'part',
			'chapter',
			'markdown',
		]);
		const second = partCells(furniture, 2, parts[1]);
		expect(second.map((cell) => cell.kind)).toEqual([
			'title-page',
			'part',
			'chapter',
			'markdown',
		]);
		expect(printsPage(second[1])).toBe(false);
		expect(second.filter((cell) => printsPage(cell) && cell.kind === 'part')).toEqual(
			[]
		);
	});

	it('points the cover at art that is now a folder away', () => {
		// The parts sit in `parts/`; the art did not move with them.
		const cells = [cover('art/cover.jpg'), seam(), chapter('One'), markdown('alpha')];
		const parts = intoParts(sectionsOf(cells));
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].attrs.src).toBe('../art/cover.jpg');
		expect(only[0].source).toBe('![Cover](../art/cover.jpg)');
	});

	it('leaves a cover that already says where its art is from', () => {
		for (const src of ['https://art.example/c.jpg', '/shared/art/c.jpg']) {
			const cells = [cover(src), seam(), chapter('One'), markdown('a')];
			const parts = intoParts(sectionsOf(cells));
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
			seam(),
			chapter('One'),
			markdown('alpha'),
		];
		const parts = intoParts(sectionsOf(cells));
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].source).toBe('![Cover](../art/c.jpg)');
		expect(only[0].attrs).toEqual({});
	});

	it('climbs one further out of a path that already climbs', () => {
		// Written from where the story stands, so a part stands one folder deeper.
		const cells = [cover('../shared/c.jpg'), seam(), chapter('One'), markdown('a')];
		const parts = intoParts(sectionsOf(cells));
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].attrs.src).toBe('../../shared/c.jpg');
	});

	it('moves the path and not an alt text that happens to match it', () => {
		const cells = [
			{ kind: 'cover', source: '![c.jpg](c.jpg)', attrs: { src: 'c.jpg' } },
			seam(),
			chapter('One'),
			markdown('a'),
		];
		const parts = intoParts(sectionsOf(cells));
		const only = partCells(furnitureOf(cells), 1, parts[0]);

		expect(only[0].source).toBe('![c.jpg](../c.jpg)');
	});

	it('a story with no furniture is a part of nothing but chapters', () => {
		const cells = [
			chapter('One'),
			markdown('alpha'),
			seam(),
			chapter('Two'),
			markdown('beta'),
		];
		const parts = intoParts(sectionsOf(cells));
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
