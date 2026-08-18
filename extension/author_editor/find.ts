// Finding and replacing across a document, apart from the page that draws it.
//
// The editor is a webview, and the find widget is the text editor's; nothing
// about Ctrl+F reaches in here. So the widget is ours, and this is what it asks:
// where the matches are, and what the document says once one is replaced. Free
// of the DOM, so it can be unit tested without a page.
//
// A cell holds two kinds of text and both are searched. The prose is the obvious
// one. The other is the facts it records — a chapter's title is in the document
// as much as the chapter is, and an author renaming a character must not have to
// rename them twice.

import type { Cell } from '../storydoc/model';
import { fieldsOf } from './model';

export interface Query {
	text: string;
	matchCase: boolean;
	wholeWord: boolean;
	regex: boolean;
}

/** One match: which cell, which of its texts, and where in it. */
export interface Match {
	/** The attribute the match is in, or null for the cell's prose. */
	field: string | null;
	cell: number;
	at: number;
	end: number;
}

/**
 * What breaks a word, so that "whole word" here means what it means in the
 * editor next door rather than whatever `\b` happens to do.
 */
const SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

/**
 * The characters a match is fenced with before the text is rendered.
 *
 * Private-use codepoints, because a fence has to be something no manuscript
 * contains and nothing in the markdown renderer treats as syntax.
 */
const OPEN = '\uE000';
const CLOSE = '\uE001';
const OPEN_CURRENT = '\uE002';
const CLOSE_CURRENT = '\uE003';

const FENCED = /\uE000([^\uE000-\uE003]*)\uE001/g;
const FENCED_CURRENT = /\uE002([^\uE000-\uE003]*)\uE003/g;
const STRAY = /[\uE000-\uE003]/g;

export function matchesIn(cells: Cell[], query: Query): Match[] {
	const pattern = patternOf(query);
	if (!pattern) {
		return [];
	}
	const found: Match[] = [];
	cells.forEach((cell, index) => {
		// The facts before the prose, which is the order the file itself is in:
		// the marker line carries the attributes and the text follows under it.
		for (const field of fieldsOf(cell.kind)) {
			for (const span of spansIn(cell.attrs[field.name] ?? '', pattern, query)) {
				found.push({ field: field.name, cell: index, ...span });
			}
		}
		for (const span of spansIn(cell.source, pattern, query)) {
			found.push({ field: null, cell: index, ...span });
		}
	});
	return found;
}

/** The document with one match written over. */
export function replaced(
	cells: Cell[],
	match: Match,
	query: Query,
	replacement: string
): Cell[] {
	const cell = cells[match.cell];
	if (!cell) {
		return cells;
	}
	const text = textOf(cell, match.field);
	const written =
		text.slice(0, match.at) +
		expanded(text, match, query, replacement) +
		text.slice(match.end);
	const next = [...cells];
	next[match.cell] = withText(cell, match.field, written);
	return next;
}

export function replacedAll(
	cells: Cell[],
	query: Query,
	replacement: string
): Cell[] {
	let next = cells;
	// Backwards, so that writing over one match does not move the next.
	for (const match of matchesIn(cells, query).reverse()) {
		next = replaced(next, match, query, replacement);
	}
	return next;
}

/**
 * Whether the query is one that can be searched for.
 *
 * A half-typed regular expression is not an error to report — the author is
 * still typing it — but the box says so, the way it does in the editor.
 */
export function isUnderstood(query: Query): boolean {
	return query.text === '' || patternOf(query) !== null;
}

/**
 * The text with its matches fenced off, ready to be rendered.
 *
 * A mark cannot be put in as a tag: the renderer escapes what it is given, as it
 * must. So the spans are fenced with characters that survive escaping, and the
 * page turns them into marks once the HTML exists.
 */
export function fenced(text: string, spans: Match[], current: Match | null): string {
	let out = text;
	// From the end, so that each fence leaves the offsets before it alone.
	for (const span of [...spans].sort((a, b) => b.at - a.at)) {
		// A match of nothing but space would turn a blank line into a paragraph.
		if (!text.slice(span.at, span.end).trim()) {
			continue;
		}
		const here = span === current;
		out =
			out.slice(0, span.at) +
			(here ? OPEN_CURRENT : OPEN) +
			out.slice(span.at, span.end) +
			(here ? CLOSE_CURRENT : CLOSE) +
			out.slice(span.end);
	}
	return out;
}

/**
 * The rendered HTML with its fences turned into marks.
 *
 * Only fences that came through rendering in pairs become marks; one that did
 * not — inside a link's address, which is never shown — is dropped rather than
 * left as a half-open tag.
 */
export function marked(html: string): string {
	return html
		.replace(FENCED_CURRENT, '<mark class="find-match current">$1</mark>')
		.replace(FENCED, '<mark class="find-match">$1</mark>')
		.replace(STRAY, '');
}

function patternOf(query: Query): RegExp | null {
	if (!query.text) {
		return null;
	}
	try {
		return new RegExp(
			query.regex ? query.text : query.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
			query.matchCase ? 'g' : 'gi'
		);
	} catch {
		return null;
	}
}

function spansIn(
	text: string,
	pattern: RegExp,
	query: Query
): { at: number; end: number }[] {
	const spans: { at: number; end: number }[] = [];
	pattern.lastIndex = 0;
	for (let found = pattern.exec(text); found; found = pattern.exec(text)) {
		// A pattern that can match nothing would otherwise sit on the same spot
		// for ever.
		if (found[0].length === 0) {
			pattern.lastIndex += 1;
			continue;
		}
		const at = found.index;
		const end = at + found[0].length;
		if (!query.wholeWord || isWholeWord(text, at, end)) {
			spans.push({ at, end });
		}
	}
	return spans;
}

/**
 * Whether neither end of the match is in the middle of a word.
 *
 * Only the ends that are word characters are asked about: a search for "-ish" would
 * otherwise be a whole word nowhere, since a dash is a break in a word itself.
 */
function isWholeWord(text: string, at: number, end: number): boolean {
	if (isWordChar(text[at]) && at > 0 && isWordChar(text[at - 1])) {
		return false;
	}
	if (isWordChar(text[end - 1]) && end < text.length && isWordChar(text[end])) {
		return false;
	}
	return true;
}

function isWordChar(character: string | undefined): boolean {
	return (
		character !== undefined &&
		!/\s/.test(character) &&
		!SEPARATORS.includes(character)
	);
}

/**
 * What goes in place of a match.
 *
 * Typed text goes in as it was typed — a replacement of "$5" is five dollars.
 * A regular expression is the one case where the author is writing a rule rather
 * than words, and there `$1` and `$&` mean what they mean everywhere else.
 */
function expanded(
	text: string,
	match: Match,
	query: Query,
	replacement: string
): string {
	const pattern = query.regex ? patternOf(query) : null;
	if (!pattern) {
		return replacement;
	}
	pattern.lastIndex = match.at;
	const found = pattern.exec(text);
	if (!found || found.index !== match.at) {
		return replacement;
	}
	return replacement.replace(/\$(\$|&|\d)/g, (whole, what: string) => {
		if (what === '$') {
			return '$';
		}
		if (what === '&') {
			return found[0];
		}
		return found[Number(what)] ?? whole;
	});
}

function textOf(cell: Cell, field: string | null): string {
	return field === null ? cell.source : (cell.attrs[field] ?? '');
}

function withText(cell: Cell, field: string | null, text: string): Cell {
	if (field === null) {
		return { ...cell, source: text };
	}
	const attrs = { ...cell.attrs, [field]: text };
	// A field replaced with nothing is a field the author has not filled in.
	if (!text) {
		delete attrs[field];
	}
	return { ...cell, attrs };
}
