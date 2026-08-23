// A story and the layout it is published in, in one human-readable file.
//
// The file is `<name>.author`, and it is markdown. What makes it a story
// document is that the markdown is cut into cells, each opened by a marker that
// says what the cell *is*:
//
//     <!-- cell: chapter title="The First Night" -->
//
//     The lantern had gone out again.
//
//     <!-- cell: cover src="art/cover.jpg" -->
//
//     ![Cover](art/cover.jpg)
//
// The marker is an HTML comment, so every reader that renders markdown renders
// the document and shows none of the scaffolding, and every editor that opens
// text can edit it. There is no custom editor a person is obliged to use.
//
// Two properties are load-bearing:
//
// **The format is open.** A cell's kind is any name, and this module knows
// nothing about most of them. An unrecognised kind is carried through parse and
// save untouched, so a document written by a newer version — or by hand —
// survives a round trip through an older one rather than losing cells.
//
// **Plain markdown is already a story document.** A file with no markers parses
// as one `markdown` cell holding the lot.
//
// This is the same format `server/storydoc.py` reads, and the two must agree —
// the round-trip and parsing rules are mirrored there test for test. Deliberately
// free of the `vscode` module, so it can be unit tested without an editor.

export const EXTENSION = '.author';

export const MARKDOWN = 'markdown';
export const CHAPTER = 'chapter';
export const PART = 'part';
export const TITLE_PAGE = 'title-page';
export const COVER = 'cover';
export const CONTENTS = 'contents';
export const DISCLAIMER = 'disclaimer';
export const ABOUT = 'about';
export const BLURB = 'blurb';
export const NOTE = 'note';

/**
 * One thing the document is made of, and what it says it is.
 *
 * `kind` is the cell's identity and is never inferred from its text — a chapter
 * called "Disclaimer" is still a chapter. `attrs` is whatever the kind needs said
 * about it, and is kept even when this module has no use for it.
 */
export interface Cell {
	kind: string;
	source: string;
	attrs: Record<string, string>;
}

const MARKER = /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
const ATTR = /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

export function parse(text: string): Cell[] {
	const cells: Cell[] = [];
	let kind = MARKDOWN;
	let attrs: Record<string, string> = {};
	let body: string[] = [];

	const close = (): void => {
		const source = trimBlankEnds(body);
		// The run of text above the first marker is only a cell if the author
		// wrote something there; a document that opens with a marker does not
		// start with an empty one.
		if (source || cells.length > 0 || kind !== MARKDOWN || hasAny(attrs)) {
			cells.push({ kind, source, attrs: { ...attrs } });
		}
	};

	for (const line of text.split('\n')) {
		const marker = MARKER.exec(line);
		if (!marker) {
			body.push(line);
			continue;
		}
		close();
		kind = marker[1];
		attrs = readAttrs(marker[2]);
		body = [];
	}
	close();
	return cells;
}

/**
 * The document as text, such that `parse(dumps(cells))` equals `cells` — with
 * every source read back as `stored` leaves it, since that is the round trip.
 */
export function dumps(cells: Cell[]): string {
	const out: string[] = [];
	for (const cell of cells) {
		out.push(markerFor(cell));
		out.push('');
		if (cell.source) {
			out.push(cell.source);
			out.push('');
		}
	}
	return out.join('\n');
}

export function cellsOf(cells: Cell[], kind: string): Cell[] {
	return cells.filter((cell) => cell.kind === kind);
}

/**
 * Whether the document already carries a cell of this kind.
 *
 * This is what keeps *prepare for publishing* from laying a second title page
 * over the one the author already wrote or edited.
 */
export function has(cells: Cell[], kind: string): boolean {
	return cells.some((cell) => cell.kind === kind);
}

/**
 * Add each wanted cell the document does not already have, in order.
 *
 * Kind is the identity, so a cell the author has since rewritten still counts as
 * present and is left exactly as they left it.
 */
export function addMissing(cells: Cell[], wanted: Cell[]): Cell[] {
	const added = [...cells];
	for (const cell of wanted) {
		if (!has(added, cell.kind)) {
			added.push(cell);
		}
	}
	return added;
}

export function markdown(source: string): Cell {
	return { kind: MARKDOWN, source, attrs: {} };
}

/**
 * A chapter is a named place in the book and nothing else.
 *
 * The prose beneath it is markdown cells, as prose is everywhere else — so a
 * chapter carries a title and no source. Moving one moves the name, and the two
 * responsibilities never sit in the same cell.
 */
export function chapter(title: string): Cell {
	return { kind: CHAPTER, source: '', attrs: { title } };
}

/**
 * A part is a named division of the story, and nothing else.
 *
 * The same bargain a chapter strikes, one level up: it names a run of chapters
 * and carries no prose of its own, so moving it moves only the name.
 */
export function part(title: string): Cell {
	return { kind: PART, source: '', attrs: { title } };
}

export function cover(src: string, alt = 'Cover'): Cell {
	return { kind: COVER, source: `![${alt}](${src})`, attrs: { src } };
}

/** The table of contents, built at export from the chapters around it. */
export function contents(): Cell {
	return { kind: CONTENTS, source: '', attrs: {} };
}

export function titleOf(cell: Cell): string {
	return cell.attrs.title ?? '';
}

/** `story.md` sits next to `story.author`. */
export function authorPathFor(mdPath: string): string {
	return mdPath.replace(/\.md$/i, '') + EXTENSION;
}

function readAttrs(text: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	// `matchAll` on a /g regex needs the index reset; the literal is shared.
	ATTR.lastIndex = 0;
	for (const found of text.matchAll(ATTR)) {
		attrs[found[1]] = unescape(found[2]);
	}
	return attrs;
}

function markerFor(cell: Cell): string {
	const said = Object.entries(cell.attrs)
		.map(([name, value]) => ` ${name}="${escape(value)}"`)
		.join('');
	return `<!-- cell: ${cell.kind}${said} -->`;
}

function escape(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unescape(value: string): string {
	return value.replace(/\\(.)/g, '$1');
}

function hasAny(attrs: Record<string, string>): boolean {
	return Object.keys(attrs).length > 0;
}

/** Python's `"\n".join(body).strip("\n")` — blank lines off both ends, nothing else. */
/**
 * A cell's text as the document reads it back.
 *
 * A cell is written to the file with a blank line under it and parsed out of it
 * again, and the parse takes the blank lines off either end — they belong to the
 * shape of the file rather than to the cell. So this is what a cell's text
 * becomes the moment it is written down, and anything comparing what it holds
 * against what the document says has to compare against this and not against
 * what was typed.
 */
export function stored(source: string): string {
	return source.replace(/^\n+/, '').replace(/\n+$/, '');
}

function trimBlankEnds(body: string[]): string {
	return stored(body.join('\n'));
}
