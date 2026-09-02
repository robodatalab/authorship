// The logic behind the .author editor: what kinds of cell there are, what a cell
// looks like rendered, which cells are built rather than written, and where a
// cell's text sits in the document.
//
// Deliberately free of both the `vscode` module and the DOM, so all of it can be
// unit tested without launching an editor or a browser. panel.ts drives the
// document with it; view.ts draws with it.

import {
	ABOUT,
	BLURB,
	CHAPTER,
	CONTENTS,
	COVER,
	DISCLAIMER,
	MARKDOWN,
	NOTE,
	PART,
	PRINT,
	RECAP,
	TITLE_PAGE,
	printsPage,
	type Cell,
} from '../storydoc/model';

/** One thing a cell records apart from prose, and what the author calls it. */
export interface CellField {
	name: string;
	label: string;
	/**
	 * What a well-formed value looks like, shown in the empty box.
	 *
	 * For a field whose label already says everything — a title is a title —
	 * there is nothing to add. For one with a shape to it, the label names the
	 * field and the hint says how to write it.
	 */
	hint?: string;
	/** Shown, but a book is complete without it. */
	optional?: boolean;
	/**
	 * A fact with two answers rather than something to write: a box to tick.
	 *
	 * Ticked is what a cell answers by saying nothing, so unticking the box is
	 * what writes the attribute. A document from before the field existed reads
	 * as the author who wrote it would expect it to.
	 */
	toggle?: boolean;
}

export interface CellKind {
	kind: string;
	/** What the cell is called in the menus and in its own gutter. */
	label: string;
	/** Built by running it, from the rest of the document, not typed by the author. */
	automated: boolean;
	/**
	 * Written by the server when the author asks, and by the author the rest of
	 * the time.
	 *
	 * Distinct from `automated`, which means the document writes the cell and the
	 * author never does. A generated cell has a run button *and* opens for
	 * editing: asking for a blurb is asking for a first draft, not for something
	 * that will be overwritten from under you.
	 */
	generated?: boolean;
	/**
	 * What a generated section is called where it is spoken of rather than headed,
	 * article and all: "the blurb", "the story so far".
	 *
	 * A label is a name for a menu — "Blurb", "The Story So Far" — and drops
	 * straight into a sentence for exactly as long as every kind is one word. The
	 * moment one is not, "Stop writing this the story so far" is what a tooltip
	 * built out of a label says. So the sentence's own words are written here,
	 * once, and the button, the menu and the notification all read from them.
	 */
	writes?: string;
	/**
	 * What a generated section is written out of, in the author's words.
	 *
	 * The one real difference between the two: a blurb is written from the story
	 * it stands in, and the story so far is written from the documents before it.
	 * Everything the author is shown while one is written says so.
	 */
	from?: string;
	/**
	 * Kept in the working document and printed in no book.
	 *
	 * What the author writes *about* the story is not part of it. Mirrors
	 * `PRIVATE_KINDS` in `server/storydoc.py`, which keeps the same cells out of
	 * the EPUB.
	 */
	unpublished?: boolean;
	/**
	 * Written about the story from inside it.
	 *
	 * A note the author leaves themselves stands where the writing it is about
	 * stands, so it travels with the chapter it was written under rather than
	 * with the book. It is still not the story: it weighs nothing where words are
	 * counted, and it leaves the format as the comment it was always written as.
	 */
	aside?: boolean;
	/**
	 * A page of the book rather than part of the story.
	 *
	 * The cover, the title page, the contents, the disclaimer, the author's page:
	 * a reader meets these on the way in or on the way out. They are printed once,
	 * where they stand, and never travel with a chapter — which is what keeps them
	 * out of the parts a division cuts.
	 */
	matter?: boolean;
	/**
	 * What the cell records apart from prose.
	 *
	 * A chapter is a name; a title page is a name and everything printed under
	 * it. Both are facts about the book rather than writing, so both are typed
	 * into fields — the alternative is a cell whose prose has to be parsed back
	 * into facts, which is the arrangement `.authorship.md` had and this format
	 * replaced.
	 */
	fields: CellField[];
	/**
	 * Holds prose. A kind that does not is only what its attributes say it is —
	 * a chapter names a place in the book, and the writing under it is markdown
	 * like writing anywhere else.
	 */
	prose: boolean;
	/**
	 * Can be cut in two where its prose leaves a gap, and joined back to one of
	 * its own kind above it.
	 *
	 * Such a section is a run of paragraphs and nothing more, so wherever one
	 * paragraph ends is somewhere the author may decide the section ends.
	 * Everything else is one indivisible thing — a chapter is a name, a cover is
	 * an image, a title page is a page — and half of any of them is nothing.
	 */
	divisible?: boolean;
	/**
	 * Stands over the writing that follows it, and says what that writing weighs.
	 *
	 * The two levels of the story: a chapter and the part the chapters are
	 * gathered into. Everything else is either the writing itself or a page of the
	 * book, and neither has anything under it to count.
	 */
	heading?: boolean;
	/**
	 * Prints its label as the section's heading.
	 *
	 * For a section the reader meets by name but the author does not get to
	 * rename — a chapter's title is the author's, "About the Author" is what that
	 * page is called.
	 */
	named?: boolean;
	/** Offered in the toolbar itself rather than behind the overflow menu. */
	primary: boolean;
	/** What a cell of this kind starts life as. */
	blank: () => Cell;
}

/**
 * What a disclaimer says before anyone has written one.
 *
 * The shape is the one these take in practice: what the story contains, that it
 * is fiction whatever happens in it, and where the author stands. What a
 * particular book needs warning about is the author's to write, so the first
 * line is the one to replace.
 */
const DISCLAIMER_TEXT = [
	'This story is intended for adult readers and contains themes and scenes',
	'that may not appeal to everyone.',
	'',
	'This story is a work of fiction and, regardless of the story\u2019s events,',
	'the author strongly believes in consent, equality, and inclusivity.',
	'',
	'Enjoy!',
].join('\n');

/**
 * The field naming the documents a section is written out of.
 *
 * One box holding paths as they are written beside the document —
 * `parts/part_1.author, parts/part_2.author` — rather than absolute ones, so a
 * story survives being moved, checked out somewhere else, or written on another
 * machine. Which file each names, and the order they are read in, is the
 * server's answer.
 */
export const DOCUMENTS = 'documents';

export const KINDS: CellKind[] = [
	{
		kind: MARKDOWN,
		prose: true,
		divisible: true,
		label: 'Markdown',
		automated: false,
		fields: [],
		primary: true,
		blank: () => ({ kind: MARKDOWN, source: '', attrs: {} }),
	},
	{
		kind: CHAPTER,
		prose: false,
		label: 'Chapter',
		automated: false,
		heading: true,
		fields: [{ name: 'title', label: 'Title' }],
		primary: true,
		blank: () => ({ kind: CHAPTER, source: '', attrs: { title: 'Untitled' } }),
	},
	{
		kind: NOTE,
		// What the author says to themselves about the story while writing it —
		// where the plot is going, what still has to be planted. It belongs beside
		// the passage it is about, which is the one place a reader must never
		// find it.
		prose: true,
		divisible: true,
		fields: [],
		label: 'Note',
		automated: false,
		unpublished: true,
		aside: true,
		primary: true,
		blank: () => ({ kind: NOTE, source: '', attrs: {} }),
	},
	{
		kind: PART,
		// A division of the story, one level above a chapter: it names the run of
		// chapters under it and holds no prose, exactly as a chapter does.
		prose: false,
		label: 'Part',
		automated: false,
		heading: true,
		// Untick `print` and the part is a seam: it still says where the story
		// divides into files, and the book goes out with no page where it stands.
		// That is how an author says "break here" without saying it to the reader.
		fields: [
			{ name: 'title', label: 'Title' },
			{
				name: PRINT,
				label: 'Printed',
				hint: 'A page of its own in the book, before the chapters under it',
				toggle: true,
			},
		],
		primary: false,
		blank: () => ({ kind: PART, source: '', attrs: { title: 'Untitled' } }),
	},
	{
		kind: TITLE_PAGE,
		prose: false,
		label: 'Title Page',
		automated: false,
		fields: [
			{ name: 'title', label: 'Title' },
			{ name: 'subtitle', label: 'Subtitle' },
			{ name: 'author', label: 'Author' },
			{ name: 'publisher', label: 'Publisher' },
			{ name: 'date', label: 'Date', hint: 'YYYY-MM-DD' },
			{ name: 'version', label: 'Version', hint: 'e.g. 1.0', optional: true },
			{ name: 'isbn', label: 'ISBN', hint: 'e.g. 978-0-000-00000-0', optional: true },
		],
		matter: true,
		primary: false,
		blank: () => ({
			kind: TITLE_PAGE,
			source: '',
			attrs: { title: 'Untitled', version: '1.0' },
		}),
	},
	{
		kind: COVER,
		prose: true,
		fields: [],
		label: 'Cover',
		automated: false,
		matter: true,
		primary: false,
		blank: () => ({
			kind: COVER,
			source: '![Cover](cover.jpg)',
			attrs: { src: 'cover.jpg' },
		}),
	},
	{
		kind: CONTENTS,
		prose: true,
		fields: [],
		label: 'Table of Contents',
		automated: true,
		matter: true,
		primary: false,
		blank: () => ({ kind: CONTENTS, source: '', attrs: {} }),
	},
	{
		kind: DISCLAIMER,
		prose: true,
		// Named as well as written: a disclaimer is a page the reader turns to, so
		// it carries a heading of its own like any other.
		fields: [{ name: 'title', label: 'Title' }],
		label: 'Disclaimer',
		automated: false,
		matter: true,
		primary: false,
		blank: () => ({
			kind: DISCLAIMER,
			source: DISCLAIMER_TEXT,
			attrs: { title: 'Disclaimer' },
		}),
	},
	{
		kind: ABOUT,
		// The blurb about the author, in their own words.
		prose: true,
		// Every one optional: a book with nowhere to send the reader is a book
		// that simply does not print this page. See `aboutMarkdown`.
		fields: [
			{ name: 'kdp', label: 'KDP', hint: 'https://amazon.com/author/…', optional: true },
			{ name: 'website', label: 'Website', hint: 'https://…', optional: true },
			{
				name: 'substack',
				label: 'Substack',
				hint: 'https://….substack.com',
				optional: true,
			},
		],
		label: 'About the Author',
		automated: false,
		named: true,
		matter: true,
		primary: false,
		blank: () => ({ kind: ABOUT, source: '', attrs: {} }),
	},
	{
		kind: BLURB,
		// The copy that sells the book, which is not in the book. It is written
		// here because it is written from the story and nowhere else has it.
		prose: true,
		fields: [],
		label: 'Blurb',
		automated: false,
		generated: true,
		writes: 'the blurb',
		from: 'the story',
		unpublished: true,
		named: true,
		primary: false,
		blank: () => ({ kind: BLURB, source: '', attrs: {} }),
	},
	{
		kind: RECAP,
		// What a reader coming to this volume from the last one needs before they
		// start. The blurb's near relation and written the same way, but out of
		// the documents *before* this one rather than out of this one — which is
		// why it is the one generated section with something to fill in.
		prose: true,
		fields: [
			{
				name: DOCUMENTS,
				label: 'Documents',
				hint: 'parts/part_1.author, parts/part_2.author',
			},
		],
		label: 'The Story So Far',
		automated: false,
		generated: true,
		writes: 'the story so far',
		from: 'the documents it names',
		unpublished: true,
		named: true,
		primary: false,
		blank: () => ({ kind: RECAP, source: '', attrs: {} }),
	},
];

/**
 * The documents a section names, in the order the author wrote them down.
 *
 * Separated by commas because a cell's attributes are one line of an HTML comment
 * and a newline is not something that line can hold. Blanks are dropped, so a
 * trailing comma and a stray space cost nothing.
 *
 * The order here is the author's rather than the reading's: the server sorts them
 * before it opens any of them, because which order a story happened in is a
 * question about the story and not about the box they were typed into.
 */
export function documentsOf(cell: Cell): string[] {
	return (cell.attrs[DOCUMENTS] ?? '')
		.split(',')
		.map((named) => named.trim())
		.filter(Boolean);
}

/** What a kind is called, falling back to the kind itself for one we don't know. */
export function labelOf(kind: string): string {
	return KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/**
 * A blank cell of this kind, as the menus make one.
 *
 * What the editor writes in for a section the book needs and the document has
 * not got. A kind nobody has heard of has no shape to start from, so it begins
 * as an empty cell of that kind rather than as nothing.
 */
export function blankOf(kind: string): Cell {
	const known = KINDS.find((k) => k.kind === kind);
	return known ? known.blank() : { kind, source: '', attrs: {} };
}

/** Whether running this cell writes it, in which case the author does not. */
export function isAutomated(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.automated ?? false;
}

/**
 * The attribute that says a section is folded away to its heading.
 *
 * Written in the document rather than kept beside it, which is the one piece of
 * how-it-looks that the file carries. It is here because it belongs to the cell
 * and not to a place in the list: an author who folds four chapters and then
 * moves one expects the fold to travel with it, and an index kept anywhere else
 * would fold whatever slid into the gap. It survives being reopened, being
 * checked out somewhere else, and being edited as text.
 */
export const FOLDED = 'folded';

/** Whether this section is folded away to its heading. */
export function isFolded(cell: Cell): boolean {
	return cell.attrs[FOLDED] === 'true';
}

/** This section folded, or unfolded — the attribute goes when it is not set. */
export function foldedCell(cell: Cell, on: boolean): Cell {
	const attrs = { ...cell.attrs };
	if (on) {
		attrs[FOLDED] = 'true';
	} else {
		delete attrs[FOLDED];
	}
	return { ...cell, attrs };
}

/** The document with one section folded, or unfolded. */
export function foldAt(cells: Cell[], index: number, on: boolean): Cell[] {
	const cell = cells[index];
	if (!cell || isFolded(cell) === on) {
		return cells;
	}
	const next = [...cells];
	next[index] = foldedCell(cell, on);
	return next;
}

/**
 * Every section folded, or every one unfolded.
 *
 * Answers the same list when there is nothing to do, so a toolbar button cannot
 * make an edit — and an undo step — out of folding a document that is already
 * folded.
 */
export function foldEvery(cells: Cell[], on: boolean): Cell[] {
	return cells.some((cell) => isFolded(cell) !== on)
		? cells.map((cell) => foldedCell(cell, on))
		: cells;
}

/** Whether this kind's label is printed as the section's heading. */
export function isNamed(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.named ?? false;
}

/** Whether the server writes this kind on request. */
export function isGenerated(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.generated ?? false;
}

/**
 * What this section is called in a sentence about writing it.
 *
 * A kind that says nothing about itself is "this section", which is true of any
 * of them and is what an unrecognised one has to be called.
 */
export function writesOf(kind: string): string {
	return KINDS.find((k) => k.kind === kind)?.writes ?? 'this section';
}

/** What this section is written out of, in the author's words. */
export function writtenFrom(kind: string): string {
	return KINDS.find((k) => k.kind === kind)?.from ?? 'the story';
}

/**
 * The fields a section still needs filled in before running it can mean
 * anything.
 *
 * Only asked of a section the server writes, and only about the facts it is
 * written *from* — a blurb needs nothing and answers with none. A section with
 * one of these empty has a run button that cannot do anything but fail, so the
 * page says so where the author is looking and the host refuses before it asks
 * the server.
 *
 * Kind-agnostic on purpose: it reads the fields the kind declares rather than
 * naming any kind, so the next generated section with a parameter is covered by
 * the code that is already here.
 */
export function unfilledFields(cell: Cell): CellField[] {
	if (!isGenerated(cell.kind)) {
		return [];
	}
	return fieldsOf(cell.kind).filter(
		(field) =>
			!field.optional &&
			!field.toggle &&
			!(cell.attrs[field.name] ?? '').trim()
	);
}

/**
 * The cell a job of this kind that started at `at` is writing, or -1 for none in
 * the list.
 *
 * An index names a cell only for as long as the cells above it stay put, and a
 * generated cell takes minutes to write — during which the rest of the document
 * is the author's to add to, delete, move and split. So the index a job began
 * with is a guess to be checked rather than an answer: it stands while it still
 * names a cell of the kind the job is writing, and otherwise the document's own
 * cell of that kind is the one that asked for it, because a document has one.
 *
 * The kind is asked for rather than taken to be "whichever kind the server
 * writes". There is more than one of those now, and a blurb that fell back to
 * the first generated cell it found would land in the story so far and take what
 * was written there with it.
 *
 * Both halves of the editor ask this and they have to agree — the page to know
 * which cell to draw the bar and the stop button on, the host to know which cell
 * to put the answer in. Asked on only one side, the author watches one cell and
 * the writing lands in another; asked on neither, it lands on whatever has moved
 * into the slot and takes that cell's text with it.
 */
export function generatedCell(cells: Cell[], at: number, kind: string): number {
	return cells[at]?.kind === kind
		? at
		: cells.findIndex((cell) => cell.kind === kind);
}

/**
 * Whether this kind stands over the writing under it, weighing what it holds.
 *
 * A kind nobody has heard of does not: an unrecognised cell is text, and text is
 * counted where it stands rather than counting anything else.
 */
export function isHeading(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.heading ?? false;
}

/**
 * Whether this kind is a page of the book rather than part of the story.
 *
 * A kind nobody has heard of is not: an unrecognised cell holds text the author
 * put in the document, and the safe reading of it is the story.
 */
export function isMatter(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.matter ?? false;
}

/**
 * Whether this kind stays in the working document and reaches no book.
 *
 * A kind nobody has heard of is published: an unrecognised cell is text the
 * author put in the document, and dropping it on the way out would lose writing.
 */
export function isUnpublished(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.unpublished ?? false;
}

/**
 * Whether this kind is written about the story rather than being it.
 *
 * A kind nobody has heard of is not: an unrecognised cell holds text the author
 * put in the document, and the safe reading of it is the story.
 */
export function isAside(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.aside ?? false;
}

/** What this kind records apart from prose; empty for a kind that is only prose. */
export function fieldsOf(kind: string): CellField[] {
	return KINDS.find((k) => k.kind === kind)?.fields ?? [];
}

/**
 * Whether this kind holds prose at all.
 *
 * A chapter does not: it names a place in the book and the writing beneath it is
 * markdown. A kind nobody has heard of is assumed to, since the text under an
 * unknown marker is the only thing it can be.
 */
export function hasProse(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.prose ?? true;
}

/**
 * Whether a section of this kind can be cut in two, or joined to its neighbour.
 *
 * A kind nobody has heard of cannot: what an unknown marker means is not ours to
 * decide, and cutting one in half would be deciding it.
 */
export function isDivisible(kind: string): boolean {
	return KINDS.find((k) => k.kind === kind)?.divisible ?? false;
}

/**
 * The lines a section may be cut at: where each rendered block after the first
 * begins.
 *
 * The blocks are what the author is looking at, so they are what the cut is
 * offered between — a line in the middle of a paragraph is a place the author
 * can see no boundary. Neither end is offered: above the first block and below
 * the last one, one of the two halves would be empty, which divides nothing.
 */
export function divisionsOf(source: string): number[] {
	return renderBlocks(source)
		.slice(1)
		.map((block) => block.line);
}

/**
 * Cut a section in two at a line, leaving both halves where the one was.
 *
 * Refused rather than done badly: a kind that is one thing, or a cut that would
 * leave a half with nothing in it, leaves the document exactly as it was.
 */
export function splitAt(cells: Cell[], index: number, line: number): Cell[] {
	const cell = cells[index];
	if (!cell || !isDivisible(cell.kind)) {
		return cells;
	}
	const lines = cell.source.split('\n');
	const above = withoutBlankEnds(lines.slice(0, line));
	const below = withoutBlankEnds(lines.slice(line));
	if (!above || !below) {
		return cells;
	}
	return [
		...cells.slice(0, index),
		{ ...cell, source: above },
		{ ...cell, source: below },
		...cells.slice(index + 1),
	];
}

/** Whether the section above this one is the same kind, so the two are one. */
export function mergesUp(cells: Cell[], index: number): boolean {
	const cell = cells[index];
	const above = cells[index - 1];
	if (!cell || !above) {
		return false;
	}
	return above.kind === cell.kind && isDivisible(cell.kind);
}

/**
 * Join a section to the one above it, which is what undoes a cut.
 *
 * The upper section survives and keeps what it recorded — it is the one that was
 * there first — and the gap between the two becomes the blank line that stands
 * between any two paragraphs.
 */
export function mergeAt(cells: Cell[], index: number): Cell[] {
	if (!mergesUp(cells, index)) {
		return cells;
	}
	const above = cells[index - 1];
	const source = [above.source, cells[index].source]
		.filter(Boolean)
		.join('\n\n');
	return [
		...cells.slice(0, index - 1),
		{ ...above, source },
		...cells.slice(index + 1),
	];
}

function withoutBlankEnds(lines: string[]): string {
	const kept = [...lines];
	while (kept.length > 0 && !kept[0].trim()) {
		kept.shift();
	}
	while (kept.length > 0 && !kept[kept.length - 1].trim()) {
		kept.pop();
	}
	return kept.join('\n');
}

/**
 * What an automated cell's text would be, built from the document around it, or
 * null for a cell nobody builds.
 *
 * The one place that knows how each automated kind is made. Running a cell,
 * running them all, and asking whether one is out of date are the same question
 * asked three ways, so they are all asked here.
 */
export function builtSource(cells: Cell[], cell: Cell): string | null {
	if (cell.kind === CONTENTS) {
		return contentsListing(cells);
	}
	return null;
}

/**
 * Rebuild one automated cell, the way running a code cell rebuilds its output.
 *
 * A cell that nobody builds is returned untouched — running it is not an error,
 * it simply has nothing to do.
 */
export function runCell(cells: Cell[], index: number): Cell[] {
	const cell = cells[index];
	if (!cell) {
		return cells;
	}
	const built = builtSource(cells, cell);
	if (built === null || built === cell.source) {
		return cells;
	}
	const next = [...cells];
	next[index] = { ...cell, source: built };
	return next;
}

/**
 * Run every automated cell.
 *
 * Each is rebuilt from the document around it, so compiling twice leaves the
 * same document and compiling after the chapters move produces the order they
 * are now in.
 */
export function compile(cells: Cell[]): Cell[] {
	return cells.map((cell) => {
		const built = builtSource(cells, cell);
		return built === null ? cell : { ...cell, source: built };
	});
}

/**
 * Whether an automated cell's text is no longer what it would build to.
 *
 * This is the freshness a notebook shows in its execution count: a cell that has
 * never been run, or whose document has moved on since, is out of date. A cell
 * nobody builds is never stale — there is nothing for it to disagree with.
 */
export function isStale(cells: Cell[], index: number): boolean {
	const cell = cells[index];
	if (!cell) {
		return false;
	}
	const built = builtSource(cells, cell);
	return built !== null && built !== cell.source;
}

function contentsListing(cells: Cell[]): string {
	const chapters = cells.filter((cell) => cell.kind === CHAPTER);
	if (chapters.length === 0) {
		return '';
	}
	return chapters
		.map((cell) => `1. ${cell.attrs.title || 'Untitled'}`)
		.join('\n');
}

/**
 * Words as a reader counts them: whitespace-separated runs carrying a letter or
 * a digit, so a scene break or a lone dash weighs nothing.
 */
export function countWords(text: string): number {
	return (text.match(/\S+/g) ?? []).filter((run) => /[\p{L}\p{N}]/u.test(run)).length;
}

/**
 * What the story weighs: the words in the markdown sections and nowhere else.
 *
 * The markdown *is* the story. Everything else in the document is either a fact
 * about the book — a chapter's title, a cover's path, what the title page prints
 * — or something written about the story rather than in it, like a note. None of
 * it is prose the reader reads, so counting any of it would give an author a
 * number that went up when they had written nothing.
 *
 * `except` leaves one section out, for a caller that already holds a newer copy
 * of it than the document does.
 */
export function wordsIn(cells: readonly Cell[], except: number | null = null): number {
	return cells.reduce(
		(total, cell, at) =>
			at === except || cell.kind !== MARKDOWN ? total : total + countWords(cell.source),
		0
	);
}

/**
 * What each part and chapter weighs, by the cell that heads it.
 *
 * The same words in the same places as the count in the toolbar: the markdown
 * sections and nothing else, so an author reading a chapter's number and the
 * document's is reading two answers to the same question. What every other cell
 * weighs is zero, which is what a title or a cover weighs there too.
 *
 * A section of prose belongs to the chapter above it and to the part above that,
 * so its words are counted into both. A part weighs what the chapters under it
 * weigh together, and the prose an author put under a part before its first
 * chapter is a part's as well — it is under the part and under no chapter.
 *
 * `except` leaves one section out, for the same reason `wordsIn` does: a caller
 * holding a newer copy of it than the document has.
 */
export function wordsByHeading(
	cells: readonly Cell[],
	except: number | null = null
): number[] {
	const words = cells.map(() => 0);
	let part: number | null = null;
	let chapter: number | null = null;

	cells.forEach((cell, at) => {
		if (cell.kind === PART) {
			// The chapters of the part that has just ended are not under this one,
			// and neither is the last of them: what follows a part is the part's.
			part = at;
			chapter = null;
			return;
		}
		if (cell.kind === CHAPTER) {
			chapter = at;
			return;
		}
		if (cell.kind !== MARKDOWN || at === except) {
			return;
		}
		const count = countWords(cell.source);
		if (chapter !== null) {
			words[chapter] += count;
		}
		if (part !== null) {
			words[part] += count;
		}
	});
	return words;
}

/**
 * The headings a cell's words are counted into, by index.
 *
 * The other half of the rule `wordsByHeading` walks, asked of one cell — which
 * is what a page redrawing a count while the author types needs: a keystroke
 * changes the two numbers above the box and no others.
 */
export function headingsOver(cells: readonly Cell[], index: number | null): number[] {
	if (index === null) {
		return [];
	}
	const over: number[] = [];
	for (let at = Math.min(index, cells.length) - 1; at >= 0; at--) {
		const kind = cells[at].kind;
		if (kind === CHAPTER && over.length === 0) {
			over.push(at);
		}
		if (kind === PART) {
			over.push(at);
			break;
		}
	}
	return over;
}

/**
 * A count as it is said: `1,240 words`.
 *
 * The thousands are marked because a manuscript's count is six digits long and
 * nobody reads `127450` at a glance — and marked here rather than by
 * `toLocaleString`, so the number does not change its shape with the machine the
 * editor was opened on while the words beside it stay English.
 */
export function saidWords(count: number): string {
	const grouped = String(count).replace(/\B(?=(\d{3})+$)/g, ',');
	return `${grouped} ${count === 1 ? 'word' : 'words'}`;
}

/** Where in the book a cell stands. Either level may be missing. */
export interface Place {
	part: string | null;
	chapter: string | null;
}

/**
 * The part and chapter a cell is under, found by walking back up the document.
 *
 * That walk is what the levels *are*: a chapter runs until something ends it,
 * and the thing that ends it is the next chapter or the next part. So the walk
 * stops at the first part it meets and reports no chapter if it has not found
 * one by then — the chapter above a part heading belongs to the part before it,
 * and naming it here would put the author in the wrong half of the book.
 *
 * A story with no parts has no part to report, and the pages before the first
 * chapter are under nothing at all.
 */
export function placeOf(cells: Cell[], index: number): Place {
	let chapter: string | null = null;
	for (let i = Math.min(index, cells.length - 1); i >= 0; i--) {
		const cell = cells[i];
		// A part that prints is a place in the book and names where the author is
		// standing; a seam is not somewhere anyone is, so the walk goes on past it
		// to the part that does name this stretch of the story.
		if (cell.kind === PART && printsPage(cell)) {
			return { part: cell.attrs.title || 'Untitled', chapter };
		}
		if (cell.kind === CHAPTER && chapter === null) {
			chapter = cell.attrs.title || 'Untitled';
		}
	}
	return { part: null, chapter };
}

/**
 * A document always has somewhere to write, so an empty one gets an empty cell.
 *
 * Applied where the document is drawn rather than where it is stored: an author
 * who opens a file and writes nothing has not changed it, and a file that gained
 * a cell just by being looked at would come back dirty.
 */
export function withDefaultCell(cells: Cell[]): Cell[] {
	if (cells.length > 0) {
		return cells;
	}
	return [blankOf(MARKDOWN)];
}

/**
 * The levels of the story, in the order markdown's headings run.
 *
 * One list, read both ways: `fromMarkdown` reads a heading as the level its
 * depth names, and `toMarkdown` writes that depth back. Everything below the
 * last of them is prose — a `####` line is something the author wrote inside a
 * scene, not a division of the book.
 */
const LEVELS: string[] = [TITLE_PAGE, PART, CHAPTER];

const HEADING = /^(#{1,3})\s+(.*)$/;

/** The heading a level of the story is written as. */
function headingFor(kind: string): string {
	return '#'.repeat(LEVELS.indexOf(kind) + 1);
}

/**
 * A plain markdown manuscript, read as cells.
 *
 * `#` names the book, `##` a part, `###` a chapter. Each of the three carries
 * only its name, so the prose under one becomes markdown cells of its own — the
 * same split the editor keeps everywhere else.
 */
export function fromMarkdown(text: string): Cell[] {
	const cells: Cell[] = [];
	let prose: string[] = [];

	const flush = (): void => {
		const source = prose.join('\n').trim();
		if (source) {
			cells.push({ kind: MARKDOWN, source, attrs: {} });
		}
		prose = [];
	};

	for (const line of text.split('\n')) {
		const heading = HEADING.exec(line.trim());
		if (!heading) {
			prose.push(line);
			continue;
		}
		flush();
		cells.push({
			kind: LEVELS[heading[1].length - 1],
			source: '',
			attrs: { title: heading[2].trim() },
		});
	}
	flush();
	return cells;
}

/**
 * The cells as a plain markdown manuscript.
 *
 * The inverse of `fromMarkdown` for the parts it can be: the story's three
 * levels go back to the headings they came from, and everything that holds
 * prose contributes its prose. What the markdown cannot carry is which cell a
 * passage came from — that is the cost of leaving the format, and the reason
 * this is an export rather than a save.
 */
export function toMarkdown(cells: Cell[]): string {
	const out: string[] = [];
	for (const cell of cells) {
		// An aside travels with the passage it was written beside, so it leaves the
		// format as what it has been all along: a comment, which every reader of
		// markdown renders as nothing at all.
		if (isAside(cell.kind)) {
			if (cell.source) {
				out.push(commented(cell.source));
			}
			continue;
		}
		// Leaving the format loses which cell a passage came from; it must not also
		// leak what was never part of the book.
		if (isUnpublished(cell.kind)) {
			continue;
		}
		if (cell.kind === TITLE_PAGE) {
			out.push(...titlePageMarkdown(cell));
			continue;
		}
		if (cell.kind === PART || cell.kind === CHAPTER) {
			// A part the book does not print is not a heading of the manuscript
			// either: it marks where the files divide, and a manuscript is one file.
			if (cell.kind === PART && !printsPage(cell)) {
				continue;
			}
			out.push(`${headingFor(cell.kind)} ${cell.attrs.title || 'Untitled'}`);
			continue;
		}
		if (cell.kind === ABOUT) {
			out.push(...aboutMarkdown(cell));
			continue;
		}
		// Any other cell that carries a name is headed by it — a disclaimer is a
		// page with a title and prose, and reads as one in markdown too. A page of
		// the book is not a level of the story, so it is headed as a chapter is:
		// markdown has no way to say "disclaimer", and it is the chapters such a
		// page stands among.
		if (cell.attrs.title) {
			out.push(`${headingFor(CHAPTER)} ${cell.attrs.title}`);
		}
		if (cell.source) {
			out.push(cell.source);
		}
	}
	return out.join('\n\n') + (out.length > 0 ? '\n' : '');
}

/**
 * A note as markdown holds one: inside a comment, read by whoever opens the file
 * and by no reader of the book.
 *
 * A note that says `-->` would close the comment early and spill the rest of
 * itself onto the page, so the one sequence a comment cannot hold is written the
 * way HTML writes it.
 */
function commented(source: string): string {
	return `<!--\n${source.replace(/-->/g, '--&gt;')}\n-->`;
}

/**
 * The title page as markdown can carry.
 *
 * Only the title survives as structure — markdown has one way to say "this is
 * the name of the thing" and no way at all to say "this is the publisher". The
 * rest goes out as a byline so that exporting loses none of it to the reader,
 * even though importing cannot put it back in its fields.
 */
/** Where the reader is sent once the story has let them go, or nothing at all. */
const AUTHOR_LINKS: [string, string][] = [
	['kdp', 'Books on Amazon'],
	['website', 'Website'],
	['substack', 'Substack'],
];

function aboutMarkdown(cell: Cell): string[] {
	const said: string[] = [];
	if (cell.source) {
		said.push(cell.source);
	}
	const links = AUTHOR_LINKS.filter(([name]) => cell.attrs[name]).map(
		([name, label]) => `[${label}](${cell.attrs[name]})`
	);
	if (links.length > 0) {
		said.push(links.join(' · '));
	}
	// Nothing written and nowhere to send anyone: the page is not printed. An
	// empty "About the Author" is worse than no page at all.
	return said.length > 0 ? [`${headingFor(CHAPTER)} About the Author`, ...said] : [];
}

function titlePageMarkdown(cell: Cell): string[] {
	const out = [`${headingFor(TITLE_PAGE)} ${cell.attrs.title || 'Untitled'}`];
	if (cell.attrs.subtitle) {
		out.push(`*${cell.attrs.subtitle}*`);
	}
	const credits = ['author', 'publisher', 'date', 'version', 'isbn']
		.map((name) => cell.attrs[name])
		.filter(Boolean);
	if (credits.length > 0) {
		out.push(credits.join(' · '));
	}
	return out;
}

export function insertAt(cells: Cell[], index: number, cell: Cell): Cell[] {
	const at = Math.max(0, Math.min(index, cells.length));
	return [...cells.slice(0, at), cell, ...cells.slice(at)];
}

export function removeAt(cells: Cell[], index: number): Cell[] {
	if (index < 0 || index >= cells.length) {
		return cells;
	}
	return [...cells.slice(0, index), ...cells.slice(index + 1)];
}

export function moveBy(cells: Cell[], index: number, by: number): Cell[] {
	const to = index + by;
	if (index < 0 || index >= cells.length || to < 0 || to >= cells.length) {
		return cells;
	}
	const moved = [...cells];
	const [cell] = moved.splice(index, 1);
	moved.splice(to, 0, cell);
	return moved;
}

/**
 * Which lines of the written document hold a cell's text, 0-based and inclusive.
 *
 * The server works on files and line numbers — correcting a passage means naming
 * the lines it is on — so a cell has to be able to say where it is. Mirrors what
 * `dumps` lays out; null when the cell has no text to point at.
 */
export function sourceLinesOf(
	cells: Cell[],
	index: number
): { start: number; end: number } | null {
	let line = 0;
	for (let i = 0; i < cells.length; i++) {
		line += 2; // the marker, then the blank line under it
		const cell = cells[i];
		if (!cell.source) {
			if (i === index) {
				return null;
			}
			continue;
		}
		const height = cell.source.split('\n').length;
		if (i === index) {
			return { start: line, end: line + height - 1 };
		}
		line += height + 1; // the text, then the blank line under it
	}
	return null;
}

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/** Only http(s) and relative paths — a `javascript:` URL in a document is not a link. */
export function safeUrl(url: string): string {
	if (/^https?:\/\//i.test(url)) {
		return url;
	}
	// Anything else carrying a scheme is refused; what is left is a relative path.
	return /^[a-z][a-z0-9+.-]*:/i.test(url) ? '#' : url;
}

function inline(text: string): string {
	let out = escapeHtml(text);
	out = out.replace(
		/!\[([^\]]*)\]\(([^)\s]+)\)/g,
		(_m, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}">`
	);
	out = out.replace(
		/\[([^\]]+)\]\(([^)\s]+)\)/g,
		(_m, label, url) => `<a href="${safeUrl(url)}">${label}</a>`
	);
	out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
	out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
	out = out.replace(/(?<!\w)_(?!_)(.+?)(?<!_)_(?!\w)/g, '<em>$1</em>');
	return out;
}

/** One top-level piece of a rendered cell, and the source line it starts on. */
export interface Block {
	line: number;
	html: string;
}

/**
 * The cell as the author will see it once they accept it, a block at a time.
 *
 * Rendered in pieces because where the pieces begin is where the section can be
 * cut: the author points at a paragraph on the page, and the cut has to land on
 * the line that paragraph was written on.
 *
 * A small renderer rather than a library: the webview's policy admits no script
 * but its own, and what a manuscript uses of markdown is a short list.
 */
export function renderBlocks(source: string): Block[] {
	const out: Block[] = [];
	let paragraph: string[] = [];
	let list: string[] | null = null;
	let ordered = false;
	// Where whichever of the two is open began, since neither is pushed until
	// something else has ended it.
	let opened = 0;

	const flushParagraph = (): void => {
		if (paragraph.length > 0) {
			out.push({ line: opened, html: `<p>${inline(paragraph.join(' '))}</p>` });
			paragraph = [];
		}
	};
	const flushList = (): void => {
		if (list) {
			out.push({
				line: opened,
				html: `<${ordered ? 'ol' : 'ul'}>${list.join('')}</${ordered ? 'ol' : 'ul'}>`,
			});
			list = null;
		}
	};
	const flush = (): void => {
		flushParagraph();
		flushList();
	};

	source.split('\n').forEach((raw, at) => {
		const line = raw.trim();
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		const bullet = /^[-*+]\s+(.*)$/.exec(line);
		const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

		if (!line) {
			flush();
		} else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
			flush();
			out.push({ line: at, html: '<hr>' });
		} else if (heading) {
			flush();
			const level = heading[1].length;
			out.push({ line: at, html: `<h${level}>${inline(heading[2])}</h${level}>` });
		} else if (line.startsWith('> ')) {
			flush();
			out.push({ line: at, html: `<blockquote>${inline(line.slice(2))}</blockquote>` });
		} else if (bullet || numbered) {
			flushParagraph();
			const wantsOrdered = numbered !== null;
			if (list && ordered !== wantsOrdered) {
				flushList();
			}
			ordered = wantsOrdered;
			if (!list) {
				list = [];
				opened = at;
			}
			list.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
		} else {
			flushList();
			if (paragraph.length === 0) {
				opened = at;
			}
			paragraph.push(line);
		}
	});
	flush();
	return out;
}

export function renderMarkdown(source: string): string {
	return renderBlocks(source)
		.map((block) => block.html)
		.join('\n');
}
