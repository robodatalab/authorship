import { describe, expect, it } from 'vitest';

import {
	KINDS,
	builtSource,
	compile,
	countWords,
	divisionsOf,
	fromMarkdown,
	generatedCell,
	insertAt,
	hasProse,
	isAside,
	isAutomated,
	isDivisible,
	isGenerated,
	isMatter,
	isNamed,
	isStale,
	isUnpublished,
	fieldsOf,
	labelOf,
	mergeAt,
	mergesUp,
	moveBy,
	placeOf,
	removeAt,
	renderMarkdown,
	runCell,
	safeUrl,
	sourceLinesOf,
	splitAt,
	toMarkdown,
	withDefaultCell,
	wordsIn,
} from '../../../extension/author_editor/model';
import {
	chapter,
	contents,
	dumps,
	markdown,
	part,
	type Cell,
} from '../../../extension/storydoc/model';

function blurb(source = ''): Cell {
	return { kind: 'blurb', source, attrs: {} };
}

describe('the kinds a section can be', () => {
	it('names every kind it offers', () => {
		for (const kind of KINDS) {
			expect(labelOf(kind.kind)).toBe(kind.label);
		}
	});

	it('falls back to the kind itself for one it does not know', () => {
		expect(labelOf('epigraph')).toBe('epigraph');
	});

	it('knows the table of contents is built rather than written', () => {
		expect(isAutomated('contents')).toBe(true);
		expect(isAutomated('chapter')).toBe(false);
		expect(isAutomated('epigraph')).toBe(false);
	});

	it('knows the blurb is written by the server but still the author’s to edit', () => {
		// Not `automated`: that would be the document writing the cell and the
		// author never touching it. Asking for a blurb asks for a first draft.
		expect(isGenerated('blurb')).toBe(true);
		expect(isAutomated('blurb')).toBe(false);
		expect(hasProse('blurb')).toBe(true);
		expect(isGenerated('contents')).toBe(false);
		expect(isGenerated('epigraph')).toBe(false);
	});

	it('finds the cell a job is writing again after the document moved it', () => {
		// The bug this exists for: a job takes minutes, the author adds a page
		// above the cell being written, and the index the job started with now
		// names the page they just added. Placed by that index, the blurb is
		// written over a table of contents the author has to get back by hand.
		const moved = [contents(), blurb()];
		expect(generatedCell(moved, 0)).toBe(1);
	});

	it('leaves the index alone while it still names the cell being written', () => {
		const cells = [markdown('a'), blurb(), markdown('b')];
		expect(generatedCell(cells, 1)).toBe(1);
	});

	it('says none when the cell being written has been deleted', () => {
		// Better than a cell: writing the blurb into whatever is left at that
		// index would take a section of the story away to make room for it.
		expect(generatedCell([markdown('a'), contents()], 1)).toBe(-1);
		expect(generatedCell([], 0)).toBe(-1);
	});

	it('says none rather than a cell for an index off either end', () => {
		expect(generatedCell([markdown('a')], 7)).toBe(-1);
		expect(generatedCell([markdown('a')], -1)).toBe(-1);
	});

	it('finds the blurb from an index that never named one', () => {
		// How an editor that comes back to a job somebody else started asks.
		expect(generatedCell([markdown('a'), blurb()], -1)).toBe(1);
	});

	it('knows the blurb belongs to the working document and to no book', () => {
		expect(isUnpublished('blurb')).toBe(true);
		expect(isUnpublished('chapter')).toBe(false);
		// An unrecognised cell is writing the author put there; it is published.
		expect(isUnpublished('epigraph')).toBe(false);
	});

	it('knows a note is written about the story rather than being it', () => {
		// Kept out of the book like the blurb, but written in the middle of the
		// story rather than beside it — which is the difference a division reads.
		expect(isUnpublished('note')).toBe(true);
		expect(isAside('note')).toBe(true);
		expect(hasProse('note')).toBe(true);
		expect(isMatter('note')).toBe(false);
		expect(isAside('blurb')).toBe(false);
		expect(isAside('markdown')).toBe(false);
		expect(isAside('epigraph')).toBe(false);
	});

	it('starts a note with nothing said and nothing to fill in', () => {
		expect(KINDS.find((k) => k.kind === 'note')!.blank()).toEqual({
			kind: 'note',
			source: '',
			attrs: {},
		});
		expect(fieldsOf('note')).toEqual([]);
	});

	it('knows which kinds are pages of the book rather than the story', () => {
		// What a reader meets on the way in or on the way out. This is what keeps
		// the cover and the author's page out of the parts a division cuts.
		for (const kind of ['title-page', 'cover', 'contents', 'disclaimer', 'about']) {
			expect(isMatter(kind), kind).toBe(true);
		}
		for (const kind of ['markdown', 'chapter', 'part', 'epigraph']) {
			expect(isMatter(kind), kind).toBe(false);
		}
	});

	it('knows a chapter records a title and markdown records nothing', () => {
		expect(fieldsOf('chapter').map((f) => f.name)).toEqual(['title']);
		expect(fieldsOf('markdown')).toEqual([]);
		expect(fieldsOf('epigraph')).toEqual([]);
	});

	it('keeps the facts and the prose in separate kinds', () => {
		// The one responsibility split the two everyday kinds exist to make: a
		// chapter names a place in the book, markdown holds the writing.
		expect(fieldsOf('chapter')).not.toHaveLength(0);
		expect(hasProse('chapter')).toBe(false);
		expect(fieldsOf('markdown')).toHaveLength(0);
		expect(hasProse('markdown')).toBe(true);
	});

	it('gives a part the same shape as a chapter — a name and nothing else', () => {
		expect(fieldsOf('part').map((f) => f.name)).toEqual(['title']);
		expect(hasProse('part')).toBe(false);
		expect(isAutomated('part')).toBe(false);
		expect(KINDS.find((k) => k.kind === 'part')!.blank()).toEqual({
			kind: 'part',
			source: '',
			attrs: { title: 'Untitled' },
		});
	});

	it('records the whole title page in fields, not in prose', () => {
		// Everything printed on a title page is a fact about the book, so none of
		// it is typed as markdown that something would have to parse back.
		expect(fieldsOf('title-page').map((f) => f.name)).toEqual([
			'title',
			'subtitle',
			'author',
			'publisher',
			'date',
			'version',
			'isbn',
		]);
		expect(hasProse('title-page')).toBe(false);
	});

	it('hints at the shape of every field that has one', () => {
		const hints = Object.fromEntries(
			fieldsOf('title-page').map((f) => [f.name, f.hint])
		);
		// A hint has to be unmistakably not a value. `YYYY-MM-DD` is a shape, and
		// the rest say `e.g.` outright — a bare `1.0` sitting in an empty box
		// reads as a version somebody typed, which is how an empty field came to
		// look like a filled one.
		expect(hints.date).toBe('YYYY-MM-DD');
		expect(hints.version).toBe('e.g. 1.0');
		expect(hints.isbn).toBe('e.g. 978-0-000-00000-0');
		for (const [name, hint] of Object.entries(hints)) {
			if (hint !== undefined) {
				expect(/^(e\.g\. |[A-Z-]+$|https?:)|…/.test(hint), `${name}: ${hint}`).toBe(
					true
				);
			}
		}
		// A title is a title; there is nothing a hint would add.
		expect(hints.title).toBeUndefined();
		expect(hints.author).toBeUndefined();
	});

	it('gives a disclaimer a heading and prose, the way a chapter page reads', () => {
		expect(fieldsOf('disclaimer').map((f) => f.name)).toEqual(['title']);
		expect(hasProse('disclaimer')).toBe(true);
	});

	it('starts a disclaimer with something worth keeping', () => {
		const blank = KINDS.find((k) => k.kind === 'disclaimer')!.blank();
		expect(blank.attrs.title).toBe('Disclaimer');
		expect(blank.source).toContain('work of fiction');
		expect(blank.source).toContain('consent');
	});

	it('records where the author can be found, all of it optional', () => {
		const fields = fieldsOf('about');
		expect(fields.map((f) => f.name)).toEqual(['kdp', 'website', 'substack']);
		expect(fields.every((f) => f.optional)).toBe(true);
		// The blurb about the author is prose, so it is written not typed in.
		expect(hasProse('about')).toBe(true);
	});

	it('names the sections the reader meets by name and no others', () => {
		expect(isNamed('about')).toBe(true);
		// A chapter is named by its author, not by its kind.
		expect(isNamed('chapter')).toBe(false);
		expect(isNamed('markdown')).toBe(false);
	});

	it('marks the facts about an edition optional', () => {
		// Which fields are optional is what an export waits for: everything else
		// on a title page has to be filled in before a book will bind, so this
		// list and `TITLE_PAGE_FIELDS` in server/publishing/epub_exporter.py are
		// two halves of one rule and have to be changed together.
		expect(fieldsOf('title-page').filter((f) => f.optional).map((f) => f.name)).toEqual([
			'version',
			'isbn',
		]);
	});

	it('starts a new chapter with no prose to hold', () => {
		expect(KINDS.find((k) => k.kind === 'chapter')!.blank().source).toBe('');
	});

	it('assumes a kind it has never heard of holds prose', () => {
		// The text under an unknown marker is the only thing it can be.
		expect(hasProse('epigraph')).toBe(true);
	});

	it('offers the everyday kinds on the bar between cells', () => {
		// The three an author reaches for while writing: the prose, the place in
		// the book it goes, and what they have to remember about it.
		expect(KINDS.filter((k) => k.primary).map((k) => k.kind)).toEqual([
			'markdown',
			'chapter',
			'note',
		]);
	});

	it('starts a new chapter with a title, so it has something to be listed by', () => {
		const blank = KINDS.find((k) => k.kind === 'chapter')!.blank();
		expect(blank.attrs.title).toBeTruthy();
	});
});

describe('compile — the sections that are built rather than written', () => {
	it('lists the chapters in the table of contents', () => {
		const compiled = compile([chapter('One'), contents(), chapter('Two')]);
		expect(compiled[1].source).toBe('1. One\n1. Two');
	});

	it('lists the chapters and not the parts they are divided into', () => {
		// A table of contents is a list of places a reader looks up, and a part is
		// a divider they meet on the way past rather than one they turn to.
		const compiled = compile([
			part('Day One'),
			chapter('One'),
			contents(),
			part('Day Two'),
			chapter('Two'),
		]);
		expect(compiled[2].source).toBe('1. One\n1. Two');
	});

	it('leaves everything that is not automated alone', () => {
		const cells = [markdown('Prose.'), contents()];
		expect(compile(cells)[0]).toEqual(cells[0]);
	});

	it('is the same document the second time', () => {
		const once = compile([chapter('One'), contents()]);
		expect(compile(once)).toEqual(once);
	});

	it('follows the chapters when they move', () => {
		const cells = [chapter('One'), contents(), chapter('Two')];
		const moved = moveBy(cells, 2, -2);
		expect(compile(moved).find((c) => c.kind === 'contents')!.source).toBe(
			'1. Two\n1. One'
		);
	});

	it('empties the listing when there are no chapters left', () => {
		const compiled = compile([{ kind: 'contents', source: '1. Gone', attrs: {} }]);
		expect(compiled[0].source).toBe('');
	});
});

describe('running one cell, the way a notebook runs one', () => {
	it('builds only the cell that was run', () => {
		const cells = [chapter('One'), contents(), contents()];
		const ran = runCell(cells, 1);
		expect(ran[1].source).toBe('1. One');
		expect(ran[2].source).toBe('');
	});

	it('leaves a cell nobody builds untouched', () => {
		const cells = [markdown('Prose.')];
		expect(runCell(cells, 0)).toEqual(cells);
	});

	it('leaves a cell that is not there untouched', () => {
		const cells = [contents()];
		expect(runCell(cells, 7)).toEqual(cells);
	});

	it('is the same document the second time', () => {
		const once = runCell([chapter('One'), contents()], 1);
		expect(runCell(once, 1)).toEqual(once);
	});
});

describe('isStale — the freshness a notebook shows as its execution count', () => {
	it('is stale before it has ever been run', () => {
		expect(isStale([chapter('One'), contents()], 1)).toBe(true);
	});

	it('is fresh once it has been run', () => {
		const ran = runCell([chapter('One'), contents()], 1);
		expect(isStale(ran, 1)).toBe(false);
	});

	it('goes stale again when the document moves on', () => {
		const ran = runCell([chapter('One'), contents()], 1);
		const grown = insertAt(ran, 1, chapter('Two'));
		expect(isStale(grown, 2)).toBe(true);
	});

	it('goes stale when a chapter is renamed', () => {
		const ran = runCell([chapter('One'), contents()], 1);
		const renamed = [...ran];
		renamed[0] = { ...renamed[0], attrs: { title: 'Renamed' } };
		expect(isStale(renamed, 1)).toBe(true);
	});

	it('is never stale for a cell nobody builds', () => {
		expect(isStale([markdown('Prose.')], 0)).toBe(false);
		expect(isStale([{ kind: 'epigraph', source: '', attrs: {} }], 0)).toBe(false);
	});

	it('is never stale for a cell that is not there', () => {
		expect(isStale([contents()], 9)).toBe(false);
	});

	it('agrees with compile — nothing is stale just after it', () => {
		const compiled = compile([chapter('One'), contents(), chapter('Two')]);
		expect(compiled.some((_c, i) => isStale(compiled, i))).toBe(false);
	});
});

describe('builtSource', () => {
	it('says what a built cell would hold', () => {
		const cells = [chapter('One'), contents()];
		expect(builtSource(cells, cells[1])).toBe('1. One');
	});

	it('says nothing for a cell nobody builds', () => {
		const cells = [markdown('Prose.')];
		expect(builtSource(cells, cells[0])).toBeNull();
	});
});

describe('withDefaultCell — a document always has somewhere to write', () => {
	it('gives an empty document one empty markdown cell', () => {
		expect(withDefaultCell([])).toEqual([
			{ kind: 'markdown', source: '', attrs: {} },
		]);
	});

	it('leaves a document that already has cells alone', () => {
		const cells = [markdown('Prose.')];
		expect(withDefaultCell(cells)).toBe(cells);
	});
});

describe('rearranging cells', () => {
	const cells = [chapter('One'), chapter('Two'), chapter('Three')];
	const titles = (list: Cell[]): string[] => list.map((c) => c.attrs.title);

	it('inserts at a position', () => {
		expect(titles(insertAt(cells, 1, chapter('New')))).toEqual([
			'One',
			'New',
			'Two',
			'Three',
		]);
	});

	it('clamps an insert past either end', () => {
		expect(insertAt(cells, 99, chapter('New'))).toHaveLength(4);
		expect(titles(insertAt(cells, -5, chapter('New')))[0]).toBe('New');
	});

	it('removes at a position', () => {
		expect(titles(removeAt(cells, 1))).toEqual(['One', 'Three']);
	});

	it('leaves the document alone when the index is not in it', () => {
		expect(removeAt(cells, 9)).toEqual(cells);
	});

	it('moves a cell by an offset', () => {
		expect(titles(moveBy(cells, 0, 2))).toEqual(['Two', 'Three', 'One']);
	});

	it('refuses to move a cell off either end', () => {
		expect(moveBy(cells, 0, -1)).toEqual(cells);
		expect(moveBy(cells, 2, 1)).toEqual(cells);
	});
});

describe('sourceLinesOf — where a cell sits in the written file', () => {
	// The server corrects prose by naming the lines it is on, so these have to
	// agree with what `dumps` actually lays out.
	const lineOf = (text: string, needle: string): number =>
		text.split('\n').findIndex((line) => line === needle);

	it('points at a cell in a one-cell document', () => {
		const cells = [markdown('Prose.')];
		const where = sourceLinesOf(cells, 0)!;
		expect(where).toEqual({ start: 2, end: 2 });
		expect(dumps(cells).split('\n')[where.start]).toBe('Prose.');
	});

	it('points past the cells above it', () => {
		const cells = [markdown('First.'), markdown('Second.')];
		const where = sourceLinesOf(cells, 1)!;
		expect(dumps(cells).split('\n')[where.start]).toBe('Second.');
	});

	it('counts a cell that runs over several lines', () => {
		const cells = [markdown('a\nb\nc'), markdown('Second.')];
		expect(sourceLinesOf(cells, 0)).toEqual({ start: 2, end: 4 });
		const where = sourceLinesOf(cells, 1)!;
		expect(dumps(cells).split('\n')[where.start]).toBe('Second.');
	});

	it('steps over a cell that has no text of its own', () => {
		const cells = [contents(), markdown('Prose.')];
		const where = sourceLinesOf(cells, 1)!;
		expect(dumps(cells).split('\n')[where.start]).toBe('Prose.');
		expect(where.start).toBe(lineOf(dumps(cells), 'Prose.'));
	});

	it('has nowhere to point for a cell with no text', () => {
		expect(sourceLinesOf([contents()], 0)).toBeNull();
	});

	it('has nowhere to point for a cell that is not there', () => {
		expect(sourceLinesOf([markdown('Prose.')], 4)).toBeNull();
	});
});

describe('placeOf — where in the book a cell stands', () => {
	it('names the chapter a passage is under', () => {
		const cells = [chapter('One'), markdown('a'), markdown('b')];
		expect(placeOf(cells, 2)).toEqual({ part: null, chapter: 'One' });
	});

	it('puts a chapter heading in its own chapter', () => {
		expect(placeOf([chapter('One')], 0)).toEqual({ part: null, chapter: 'One' });
	});

	it('names the part as well, once the story is divided into them', () => {
		const cells = [part('Day One'), chapter('One'), markdown('a')];
		expect(placeOf(cells, 2)).toEqual({ part: 'Day One', chapter: 'One' });
	});

	it('reports no part for a story that has none', () => {
		const cells = [chapter('One'), markdown('a'), chapter('Two'), markdown('b')];
		expect(placeOf(cells, 3)).toEqual({ part: null, chapter: 'Two' });
	});

	it('leaves the chapter behind at a part heading, which ended it', () => {
		const cells = [part('Day One'), chapter('One'), part('Day Two'), markdown('a')];
		expect(placeOf(cells, 3)).toEqual({ part: 'Day Two', chapter: null });
	});

	it('reports nowhere for the pages before the first chapter', () => {
		expect(placeOf([contents(), markdown('a')], 1)).toEqual({
			part: null,
			chapter: null,
		});
	});

	it('calls an untitled chapter what the contents call it', () => {
		const cells: Cell[] = [{ kind: 'chapter', source: '', attrs: {} }];
		expect(placeOf(cells, 0)).toEqual({ part: null, chapter: 'Untitled' });
	});

	it('reports nowhere for a cell that is not in the document', () => {
		expect(placeOf([], 0)).toEqual({ part: null, chapter: null });
	});
});

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

	it('counts across the lines of a paragraph as one run of prose', () => {
		expect(countWords('The lantern\nhad gone out\n\nagain.')).toBe(6);
	});
});

describe('wordsIn — what the story weighs', () => {
	it('counts the prose', () => {
		expect(wordsIn([markdown('The lantern had gone out again.')])).toBe(6);
	});

	it('adds up every markdown section in the document', () => {
		expect(wordsIn([markdown('one two'), markdown('three four five')])).toBe(5);
	});

	it('counts nothing in a document with no prose in it', () => {
		expect(wordsIn([chapter('The First Night'), contents()])).toBe(0);
		expect(wordsIn([])).toBe(0);
	});

	it('does not count a chapter or part title, which names the book', () => {
		// A title is a fact about the book rather than writing, and an author who
		// renames a chapter has not written four words.
		expect(
			wordsIn([part('Day One'), chapter('The First Night'), markdown('one two')])
		).toBe(2);
	});

	it('does not count a note, which is written about the story', () => {
		const cells: Cell[] = [
			markdown('one two'),
			{ kind: 'note', source: 'She has to find the letter here.', attrs: {} },
		];
		expect(wordsIn(cells)).toBe(2);
	});

	it('does not count the book\u2019s own pages', () => {
		const cells: Cell[] = [
			{ kind: 'title-page', source: '', attrs: { title: 'The Long Night' } },
			{ kind: 'cover', source: '![Cover](art/cover.jpg)', attrs: { src: 'art/cover.jpg' } },
			{ kind: 'disclaimer', source: 'All persons are fictitious.', attrs: {} },
			{ kind: 'about', source: 'She lives by the sea.', attrs: {} },
			{ kind: 'blurb', source: 'A lantern goes out.', attrs: {} },
			markdown('one two'),
		];
		expect(wordsIn(cells)).toBe(2);
	});

	it('counts nothing in a kind it has never heard of', () => {
		const cells: Cell[] = [{ kind: 'epigraph', source: 'a b c', attrs: {} }];
		expect(wordsIn(cells)).toBe(0);
	});

	it('leaves out the one section the caller says it holds a newer copy of', () => {
		const cells = [markdown('one two'), markdown('three four five')];
		expect(wordsIn(cells, 1)).toBe(2);
	});

	it('leaves out nothing for an index that is not in the document', () => {
		expect(wordsIn([markdown('one two')], 7)).toBe(2);
	});
});

describe('renderMarkdown', () => {
	it('renders headings, paragraphs and rules', () => {
		expect(renderMarkdown('# Title')).toBe('<h1>Title</h1>');
		expect(renderMarkdown('one\ntwo')).toBe('<p>one two</p>');
		expect(renderMarkdown('---')).toBe('<hr>');
	});

	it('renders emphasis, code and links', () => {
		expect(renderMarkdown('**b**')).toBe('<p><strong>b</strong></p>');
		expect(renderMarkdown('*i*')).toBe('<p><em>i</em></p>');
		expect(renderMarkdown('`c`')).toBe('<p><code>c</code></p>');
		expect(renderMarkdown('[t](https://e.com)')).toBe(
			'<p><a href="https://e.com">t</a></p>'
		);
	});

	it('renders an image, which is how a cover is written', () => {
		expect(renderMarkdown('![Cover](cover.jpg)')).toBe(
			'<p><img src="cover.jpg" alt="Cover"></p>'
		);
	});

	it('renders both kinds of list', () => {
		expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
		expect(renderMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
	});

	it('separates paragraphs on a blank line', () => {
		expect(renderMarkdown('one\n\ntwo')).toBe('<p>one</p>\n<p>two</p>');
	});

	it('escapes html in the prose before it formats it', () => {
		expect(renderMarkdown('a < b & c')).toBe('<p>a &lt; b &amp; c</p>');
		expect(renderMarkdown('<script>alert(1)</script>')).toContain('&lt;script&gt;');
	});

	it('escapes html inside emphasis too', () => {
		expect(renderMarkdown('**<b>**')).toBe('<p><strong>&lt;b&gt;</strong></p>');
	});
});

describe('safeUrl', () => {
	it('keeps http and https', () => {
		expect(safeUrl('https://example.com')).toBe('https://example.com');
		expect(safeUrl('http://example.com')).toBe('http://example.com');
	});

	it('keeps a relative path, which is how a cover is named', () => {
		expect(safeUrl('art/cover.jpg')).toBe('art/cover.jpg');
		expect(safeUrl('./cover.jpg')).toBe('./cover.jpg');
	});

	it('refuses a script url', () => {
		expect(safeUrl('javascript:alert(1)')).toBe('#');
		expect(safeUrl('JavaScript:alert(1)')).toBe('#');
	});

	it('refuses any other scheme', () => {
		expect(safeUrl('file:///etc/passwd')).toBe('#');
		expect(safeUrl('vbscript:x')).toBe('#');
	});
});

describe('fromMarkdown — reading a plain manuscript in', () => {
	it('reads `###` as a chapter that carries only its name', () => {
		const cells = fromMarkdown('### The First Night\n\nIt began badly.\n');
		expect(cells).toEqual([
			{ kind: 'chapter', source: '', attrs: { title: 'The First Night' } },
			{ kind: 'markdown', source: 'It began badly.', attrs: {} },
		]);
	});

	it('reads `##` as a part, the level between the book and its chapters', () => {
		const cells = fromMarkdown('## Day One\n\n### The First Night\n');
		expect(cells).toEqual([
			{ kind: 'part', source: '', attrs: { title: 'Day One' } },
			{ kind: 'chapter', source: '', attrs: { title: 'The First Night' } },
		]);
	});

	it('reads `#` as the book title, into the title page\u2019s field', () => {
		const cells = fromMarkdown('# The Lantern\n');
		expect(cells).toEqual([
			{ kind: 'title-page', source: '', attrs: { title: 'The Lantern' } },
		]);
	});

	it('reads a whole manuscript in order', () => {
		const cells = fromMarkdown(
			'# Book\n\nintro\n\n### One\n\na\n\n### Two\n\nb\n'
		);
		expect(cells.map((c) => c.kind)).toEqual([
			'title-page',
			'markdown',
			'chapter',
			'markdown',
			'chapter',
			'markdown',
		]);
	});

	it('reads the three levels of a divided manuscript in order', () => {
		const cells = fromMarkdown(
			'# Book\n\n## Day One\n\n### One\n\na\n\n## Day Two\n\n### Two\n\nb\n'
		);
		expect(cells.map((c) => [c.kind, c.attrs.title ?? c.source])).toEqual([
			['title-page', 'Book'],
			['part', 'Day One'],
			['chapter', 'One'],
			['markdown', 'a'],
			['part', 'Day Two'],
			['chapter', 'Two'],
			['markdown', 'b'],
		]);
	});

	it('reads a manuscript with no headings as one markdown cell', () => {
		expect(fromMarkdown('just prose\nand more\n')).toEqual([
			{ kind: 'markdown', source: 'just prose\nand more', attrs: {} },
		]);
	});

	it('reads an empty manuscript as no cells at all', () => {
		expect(fromMarkdown('')).toEqual([]);
		expect(fromMarkdown('\n\n')).toEqual([]);
	});

	it('does not mistake a heading below a chapter for one', () => {
		// Three levels is the whole of the story's structure; a `####` line is
		// something the author wrote inside a scene.
		const cells = fromMarkdown('#### A scene\n\nprose\n');
		expect(cells.map((c) => c.kind)).toEqual(['markdown']);
	});

	it('does not mistake a hash with no space after it for a heading', () => {
		expect(fromMarkdown('#notatitle\n').map((c) => c.kind)).toEqual(['markdown']);
		expect(fromMarkdown('##3 of them\n').map((c) => c.kind)).toEqual(['markdown']);
	});
});

describe('toMarkdown — writing a plain manuscript out', () => {
	it('writes a chapter as `###`, a level below the part it sits in', () => {
		expect(toMarkdown([chapter('One')])).toBe('### One\n');
	});

	it('writes the three levels of the story as the three headings markdown has', () => {
		const written = toMarkdown([
			{ kind: 'title-page', source: '', attrs: { title: 'Book' } },
			part('One'),
			chapter('The First Night'),
			markdown('a'),
		]);
		expect(written).toBe('# Book\n\n## One\n\n### The First Night\n\na\n');
	});

	it('writes a part with no name of its own under a placeholder', () => {
		expect(toMarkdown([{ kind: 'part', source: '', attrs: {} }])).toBe(
			'## Untitled\n'
		);
	});

	it('writes prose as itself', () => {
		expect(toMarkdown([markdown('It began badly.')])).toBe('It began badly.\n');
	});

	it('separates sections by a blank line', () => {
		expect(toMarkdown([chapter('One'), markdown('a'), chapter('Two')])).toBe(
			'### One\n\na\n\n### Two\n'
		);
	});

	it('heads a disclaimer with its title, at the level of the chapters it stands among', () => {
		// A page of the book is not a level of the story, and markdown has no way
		// to say "disclaimer" — so it is headed the way a chapter is.
		expect(
			toMarkdown([{ kind: 'disclaimer', source: 'Careful.', attrs: { title: 'Heads Up!' } }])
		).toBe('### Heads Up!\n\nCareful.\n');
	});

	it('prints nothing at all when the author has filled nothing in', () => {
		expect(toMarkdown([{ kind: 'about', source: '', attrs: {} }])).toBe('');
	});

	it('prints the author page for a single link', () => {
		expect(
			toMarkdown([{ kind: 'about', source: '', attrs: { substack: 'https://s.example' } }])
		).toBe('### About the Author\n\n[Substack](https://s.example)\n');
	});

	it('prints the blurb above the links', () => {
		const written = toMarkdown([
			{
				kind: 'about',
				source: 'A. Writer lives by the sea.',
				attrs: { kdp: 'https://a.example', website: 'https://w.example' },
			},
		]);
		expect(written).toBe(
			'### About the Author\n\nA. Writer lives by the sea.\n\n' +
				'[Books on Amazon](https://a.example) \u00b7 [Website](https://w.example)\n'
		);
	});

	it('prints the author page for a blurb with no links at all', () => {
		expect(
			toMarkdown([{ kind: 'about', source: 'A. Writer lives by the sea.', attrs: {} }])
		).toContain('A. Writer lives by the sea.');
	});

	it('leaves out a cell that holds nothing', () => {
		expect(toMarkdown([contents(), markdown('a')])).toBe('a\n');
	});

	it('writes an empty document as nothing at all', () => {
		expect(toMarkdown([])).toBe('');
	});

	it('leaves the blurb out — it belongs to the working document', () => {
		const written = toMarkdown([
			{ kind: 'blurb', source: 'A woman loses her name.', attrs: {} },
			chapter('One'),
			markdown('a'),
		]);
		expect(written).not.toContain('A woman loses her name.');
		expect(written).toBe('### One\n\na\n');
	});

	it('writes a note into the comment it has been all along', () => {
		const written = toMarkdown([
			chapter('One'),
			{ kind: 'note', source: 'She has to find the letter here.', attrs: {} },
			markdown('a'),
		]);
		expect(written).toBe(
			'### One\n\n<!--\nShe has to find the letter here.\n-->\n\na\n'
		);
	});

	it('keeps a note that says `-->` inside its comment', () => {
		// The one sequence that would close the comment early and spill the rest
		// of the note onto the page.
		expect(toMarkdown([{ kind: 'note', source: 'Anna --> the tower.', attrs: {} }])).toBe(
			'<!--\nAnna --&gt; the tower.\n-->\n'
		);
	});

	it('writes nothing at all for a note nobody has written', () => {
		expect(
			toMarkdown([{ kind: 'note', source: '', attrs: {} }, markdown('a')])
		).toBe('a\n');
	});

	it('round-trips a manuscript back to the cells it was read from', () => {
		const source = '# Book\n\nintro\n\n### One\n\na\n\n### Two\n\nb\n';
		const cells = fromMarkdown(source);
		expect(fromMarkdown(toMarkdown(cells))).toEqual(cells);
	});

	it('round-trips a manuscript divided into parts', () => {
		const source = '# Book\n\n## Day One\n\n### One\n\na\n\n## Day Two\n\n### Two\n\nb\n';
		const cells = fromMarkdown(source);
		expect(toMarkdown(cells)).toBe(source);
		expect(fromMarkdown(toMarkdown(cells))).toEqual(cells);
	});

	it('writes the title page out as a heading and a byline', () => {
		const written = toMarkdown([
			{
				kind: 'title-page',
				source: '',
				attrs: {
					title: 'The Lantern',
					subtitle: 'A Novel',
					author: 'A. Writer',
					publisher: 'Riverlight',
					date: '2026',
				},
			},
		]);
		expect(written).toBe(
			'# The Lantern\n\n*A Novel*\n\nA. Writer \u00b7 Riverlight \u00b7 2026\n'
		);
	});

	it('carries every title-page field into the export, losing none to the reader', () => {
		// Markdown has nowhere to put a publisher, so importing cannot put these
		// back in their fields — but exporting must not silently drop them.
		const written = toMarkdown([
			{
				kind: 'title-page',
				source: '',
				attrs: { title: 'T', author: 'A', publisher: 'P', date: 'D', version: 'V', isbn: 'I' },
			},
		]);
		for (const value of ['T', 'A', 'P', 'D', 'V', 'I']) {
			expect(written).toContain(value);
		}
	});
});

describe('dividing a section', () => {
	it('divides the sections that are only prose, and nothing else', () => {
		expect(isDivisible('markdown')).toBe(true);
		expect(isDivisible('note')).toBe(true);
		expect(isDivisible('chapter')).toBe(false);
		expect(isDivisible('cover')).toBe(false);
		expect(isDivisible('title-page')).toBe(false);
		expect(isDivisible('epigraph')).toBe(false);
	});

	it('offers every paragraph but the first as somewhere to cut', () => {
		expect(divisionsOf('one\n\ntwo\n\nthree')).toEqual([2, 4]);
	});

	it('offers nowhere at all in a section that is one paragraph', () => {
		expect(divisionsOf('one\ntwo')).toEqual([]);
	});

	it('counts a heading, a list and a rule as places of their own', () => {
		expect(divisionsOf('one\n\n# Two\n\n- a\n- b\n\n---')).toEqual([2, 4, 7]);
	});

	it('cuts the section in two at the line', () => {
		expect(splitAt([markdown('one\n\ntwo')], 0, 2)).toEqual([
			markdown('one'),
			markdown('two'),
		]);
	});

	it('leaves the sections around the cut where they were', () => {
		const cells = [chapter('One'), markdown('a\n\nb'), chapter('Two')];
		expect(splitAt(cells, 1, 2).map((cell) => cell.kind)).toEqual([
			'chapter',
			'markdown',
			'markdown',
			'chapter',
		]);
	});

	it('refuses a cut that would leave a half with nothing in it', () => {
		const cells = [markdown('one\n\ntwo')];
		expect(splitAt(cells, 0, 0)).toBe(cells);
		expect(splitAt(cells, 0, 9)).toBe(cells);
	});

	it('refuses to cut a section that is one thing', () => {
		const cells = [chapter('One')];
		expect(splitAt(cells, 0, 1)).toBe(cells);
	});
});

describe('joining a section to the one above it', () => {
	it('joins two of the same kind and nothing else', () => {
		expect(mergesUp([markdown('a'), markdown('b')], 1)).toBe(true);
		expect(mergesUp([markdown('a'), markdown('b')], 0)).toBe(false);
		expect(mergesUp([chapter('One'), markdown('b')], 1)).toBe(false);
		expect(mergesUp([chapter('One'), chapter('Two')], 1)).toBe(false);
	});

	it('joins notes the way it joins markdown', () => {
		const first: Cell = { kind: 'note', source: 'a', attrs: {} };
		const second: Cell = { kind: 'note', source: 'b', attrs: {} };
		expect(mergesUp([first, second], 1)).toBe(true);
		expect(mergeAt([first, second], 1)).toEqual([
			{ kind: 'note', source: 'a\n\nb', attrs: {} },
		]);
	});

	it('puts the two back with a blank line between them', () => {
		expect(mergeAt([markdown('one'), markdown('two')], 1)).toEqual([
			markdown('one\n\ntwo'),
		]);
	});

	it('undoes a cut exactly', () => {
		const cells = [markdown('one\n\ntwo\n\nthree')];
		expect(mergeAt(splitAt(cells, 0, 2), 1)).toEqual(cells);
	});

	it('leaves a document it cannot join alone', () => {
		const cells = [chapter('One'), markdown('b')];
		expect(mergeAt(cells, 1)).toBe(cells);
	});
});
