import { describe, expect, it } from 'vitest';

import {
	KINDS,
	builtSource,
	compile,
	fromMarkdown,
	insertAt,
	hasProse,
	isAutomated,
	isNamed,
	isStale,
	fieldsOf,
	labelOf,
	moveBy,
	removeAt,
	renderMarkdown,
	runCell,
	safeUrl,
	sourceLinesOf,
	toMarkdown,
	withDefaultCell,
} from '../../../extension/author_editor/model';
import {
	chapter,
	contents,
	dumps,
	markdown,
	type Cell,
} from '../../../extension/storydoc/model';

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
		expect(hints.date).toBe('YYYY-MM-DD');
		expect(hints.version).toBe('1.0');
		expect(hints.isbn).toBeTruthy();
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

	it('marks only the ISBN optional', () => {
		expect(fieldsOf('title-page').filter((f) => f.optional).map((f) => f.name)).toEqual([
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

	it('offers the two everyday kinds on the bar between cells', () => {
		expect(KINDS.filter((k) => k.primary).map((k) => k.kind)).toEqual([
			'markdown',
			'chapter',
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
	it('reads `##` as a chapter that carries only its name', () => {
		const cells = fromMarkdown('## The First Night\n\nIt began badly.\n');
		expect(cells).toEqual([
			{ kind: 'chapter', source: '', attrs: { title: 'The First Night' } },
			{ kind: 'markdown', source: 'It began badly.', attrs: {} },
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
			'# Book\n\nintro\n\n## One\n\na\n\n## Two\n\nb\n'
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

	it('reads a manuscript with no headings as one markdown cell', () => {
		expect(fromMarkdown('just prose\nand more\n')).toEqual([
			{ kind: 'markdown', source: 'just prose\nand more', attrs: {} },
		]);
	});

	it('reads an empty manuscript as no cells at all', () => {
		expect(fromMarkdown('')).toEqual([]);
		expect(fromMarkdown('\n\n')).toEqual([]);
	});

	it('does not mistake `###` for a chapter', () => {
		const cells = fromMarkdown('### A scene\n\nprose\n');
		expect(cells.map((c) => c.kind)).toEqual(['markdown']);
	});
});

describe('toMarkdown — writing a plain manuscript out', () => {
	it('writes a chapter back as the `##` it came from', () => {
		expect(toMarkdown([chapter('One')])).toBe('## One\n');
	});

	it('writes prose as itself', () => {
		expect(toMarkdown([markdown('It began badly.')])).toBe('It began badly.\n');
	});

	it('separates sections by a blank line', () => {
		expect(toMarkdown([chapter('One'), markdown('a'), chapter('Two')])).toBe(
			'## One\n\na\n\n## Two\n'
		);
	});

	it('heads a disclaimer with its title, like any other page', () => {
		expect(
			toMarkdown([{ kind: 'disclaimer', source: 'Careful.', attrs: { title: 'Heads Up!' } }])
		).toBe('## Heads Up!\n\nCareful.\n');
	});

	it('prints nothing at all when the author has filled nothing in', () => {
		expect(toMarkdown([{ kind: 'about', source: '', attrs: {} }])).toBe('');
	});

	it('prints the author page for a single link', () => {
		expect(
			toMarkdown([{ kind: 'about', source: '', attrs: { substack: 'https://s.example' } }])
		).toBe('## About the Author\n\n[Substack](https://s.example)\n');
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
			'## About the Author\n\nA. Writer lives by the sea.\n\n' +
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

	it('round-trips a manuscript back to the cells it was read from', () => {
		const source = '# Book\n\nintro\n\n## One\n\na\n\n## Two\n\nb\n';
		const cells = fromMarkdown(source);
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
