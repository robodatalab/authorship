import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	CHAPTER,
	CONTENTS,
	COVER,
	DISCLAIMER,
	EXTENSION,
	addMissing,
	authorPathFor,
	cellsOf,
	chapter,
	contents,
	cover,
	dumps,
	has,
	markdown,
	parse,
	titleOf,
	type Cell,
} from '../../../extension/storydoc/model';

interface Case {
	name: string;
	text: string;
	cells: Cell[];
	dumped: string;
}

const CORPUS: { cases: Case[] } = JSON.parse(
	readFileSync(join(__dirname, '../../storydoc_corpus.json'), 'utf-8')
);

describe('the shared corpus — the same documents server/storydoc.py reads', () => {
	// The same file drives the Python tests, so a rule added in one language
	// cannot quietly go unimplemented in the other.
	for (const testCase of CORPUS.cases) {
		it(testCase.name, () => {
			expect(parse(testCase.text)).toEqual(testCase.cells);
		});
	}

	// Round-tripping through this library alone would let the two implementations
	// drift apart while both stayed self-consistent, so the corpus pins the bytes
	// rather than the behaviour.
	for (const testCase of CORPUS.cases) {
		it(`writes back byte for byte: ${testCase.name}`, () => {
			expect(dumps(parse(testCase.text))).toBe(testCase.dumped);
		});
	}

	for (const testCase of CORPUS.cases) {
		it(`survives a round trip: ${testCase.name}`, () => {
			const cells = parse(testCase.text);
			expect(parse(dumps(cells))).toEqual(cells);
		});
	}
});

describe('writing', () => {
	it('writes a cell as a marker and its text', () => {
		expect(dumps([markdown('Prose.')])).toBe(
			'<!-- cell: markdown -->\n\nProse.\n'
		);
	});

	it('writes a chapter as its marker alone, since it is only a name', () => {
		expect(dumps([chapter('One')])).toBe('<!-- cell: chapter title="One" -->\n');
	});

	it('writes a cell with no text as its marker alone', () => {
		expect(dumps([contents()])).toBe('<!-- cell: contents -->\n');
	});

	it('writes an unknown kind back as it was read', () => {
		const text = '<!-- cell: epigraph attribution="Anon" -->\n\nA line.\n';
		expect(dumps(parse(text))).toBe(text);
	});

	it('escapes a quote in an attribute on the way out', () => {
		expect(dumps([chapter('She said "no"')])).toContain(
			'title="She said \\"no\\""'
		);
	});
});

describe('asking what a document carries', () => {
	it('finds a kind the document carries', () => {
		const cells = [chapter('One'), contents()];
		expect(has(cells, CONTENTS)).toBe(true);
		expect(has(cells, COVER)).toBe(false);
	});

	it('returns every cell of a kind in order', () => {
		const cells = [chapter('One'), contents(), chapter('Two')];
		expect(cellsOf(cells, CHAPTER).map(titleOf)).toEqual(['One', 'Two']);
	});

	it('knows a cell by its kind and not by its title', () => {
		// The whole reason a cell carries a kind: a chapter the author named
		// "Disclaimer" is a chapter.
		const cells = [chapter('Disclaimer')];
		expect(has(cells, DISCLAIMER)).toBe(false);
		expect(has(cells, CHAPTER)).toBe(true);
	});
});

describe('preparing for publishing', () => {
	it('adds the missing cells in order', () => {
		const prepared = addMissing([chapter('One')], [contents(), cover('c.jpg')]);
		expect(prepared.map((cell) => cell.kind)).toEqual([
			'chapter',
			'contents',
			'cover',
		]);
	});

	it('adds nothing the second time', () => {
		const wanted = [contents(), cover('c.jpg')];
		const once = addMissing([chapter('One')], wanted);
		expect(addMissing(once, wanted)).toEqual(once);
	});

	it('leaves a cell the author has edited alone', () => {
		const mine: Cell = { kind: CONTENTS, source: 'My own contents.', attrs: {} };
		expect(addMissing([mine], [contents()])).toEqual([mine]);
	});
});

describe('authorPathFor', () => {
	it('sits next to the manuscript it lays out', () => {
		expect(authorPathFor('/work/data/story.md')).toBe(`/work/data/story${EXTENSION}`);
	});

	it('takes the extension off whatever case it was written in', () => {
		expect(authorPathFor('/work/STORY.MD')).toBe(`/work/STORY${EXTENSION}`);
	});

	it('only takes the extension off the end', () => {
		expect(authorPathFor('/work/notes.md/chapter.md')).toBe(
			`/work/notes.md/chapter${EXTENSION}`
		);
	});
});
