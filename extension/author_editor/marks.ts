// What the checks found, between the server saying it and the page drawing it.
//
// A finding arrives in the coordinates the server works in — a line in the file
// and a character on it — and has to be drawn in the ones the page works in,
// which are a cell and an offset into its text. Converting between the two is
// the first thing here.
//
// The second is that a mark outlives the text it was made about. The author goes
// on typing, and a mark left where it was would drift off the word it was put
// under. So marks are taken through each edit: moved when the change was
// somewhere else, dropped when the change was underneath them.
//
// The third is that some faults are in more than one place. A repetition is a
// pair, and an underline under one half of it says nothing — so a mark carries
// everywhere it is wrong, and editing any of those places puts the whole mark
// out rather than half of it.
//
// Free of the DOM and of `vscode`, so it can be unit tested without a page.

import type { Cell } from '../storydoc/model';

/** Somewhere a fault is, in the page's own coordinates. */
export interface Span {
	cell: number;
	at: number;
	end: number;
}

export interface Mark {
	/** Its place in the report it came in, which is what the page draws it by. */
	id: number;
	/** Which rule found it — what the fix is asked for by, and judged by. */
	rule: string;
	/** What sort of fault it is, which is the colour it is drawn in. */
	kind: string;
	/** What found it. Marks are replaced a source at a time, never all at once. */
	source: string;
	/** What could go there instead, when whatever found the fault already knows. */
	replacements: string[];
	/** What fits under the underline. */
	message: string;
	/** What the author reads when they stop on it. */
	detail: string;
	cell: number;
	at: number;
	end: number;
	/** The rest of the same fault; empty for one that is in a single place. */
	related: Span[];
}

/** A place in the file, which is how the server says where anything is. */
interface At {
	line: number;
	character: number;
}

/** One thing the server found. */
export interface Finding {
	rule: string;
	kind: string;
	message: string;
	detail: string;
	at: At;
	end: At;
	related: { at: At; end: At }[];
	replacements?: string[];
}

/** What an edit did to a cell's text, in the text as it was before it. */
export interface Change {
	at: number;
	removed: number;
	inserted: number;
}

/**
 * The fences a span is written between before the text is rendered.
 *
 * The same bargain the find widget strikes, and deliberately not the same
 * characters: a match and a mark can be over the same word, and each has to come
 * out of rendering knowing which it was. The digits between the first two are
 * the mark's id, so what the page draws can be asked what it is about.
 */
const OPEN = '\uE010';
const SHUT = '\uE011';
const CLOSE = '\uE012';

const FENCED = /\uE010([\d,]+)\uE011([^\uE010-\uE012]*)\uE012/g;
const STRAY = /[\uE010-\uE012]/g;

/**
 * Where each cell's text begins in the file, and where each of its lines begins
 * in the text. Mirrors what `dumps` lays out, as `sourceLinesOf` does.
 */
interface Place {
	first: number;
	offsets: number[];
}

function placement(cells: Cell[]): Place[] {
	const places: Place[] = [];
	let line = 0;
	for (const cell of cells) {
		line += 2; // the marker, then the blank line under it
		if (!cell.source) {
			places.push({ first: line, offsets: [] });
			continue;
		}
		const lines = cell.source.split('\n');
		const offsets: number[] = [];
		let at = 0;
		for (const one of lines) {
			offsets.push(at);
			at += one.length + 1;
		}
		places.push({ first: line, offsets });
		line += lines.length + 1; // the text, then the blank line under it
	}
	return places;
}

function spanAt(places: Place[], at: At, end: At): Span | null {
	// Both ends in one cell or none at all: a run of text that crosses a marker
	// is not a run of text the page can draw a line under.
	for (let cell = 0; cell < places.length; cell++) {
		const place = places[cell];
		const first = at.line - place.first;
		const last = end.line - place.first;
		if (first < 0 || first >= place.offsets.length) {
			continue;
		}
		if (last < 0 || last >= place.offsets.length) {
			return null;
		}
		return {
			cell,
			at: place.offsets[first] + at.character,
			end: place.offsets[last] + end.character,
		};
	}
	return null;
}

/**
 * The report, in the coordinates the page draws in.
 *
 * `from` is the first id to give out. Marks come from more than one place — the
 * server's rules and the checker running in the page itself — and two of them
 * numbering their findings from nothing would be two marks claiming to be the
 * same one.
 */
export function placed(
	cells: Cell[],
	findings: Finding[],
	from: number,
	source: string
): Mark[] {
	const places = placement(cells);
	const marks: Mark[] = [];
	findings.forEach((finding, index) => {
		const id = from + index;
		const span = spanAt(places, finding.at, finding.end);
		if (!span) {
			return;
		}
		const related: Span[] = [];
		for (const one of finding.related ?? []) {
			const also = spanAt(places, one.at, one.end);
			// A fault whose other half cannot be placed is still a fault where it
			// can be, and is drawn there rather than dropped.
			if (also) {
				related.push(also);
			}
		}
		marks.push({
			id,
			rule: finding.rule,
			kind: finding.kind,
			source,
			replacements: finding.replacements ?? [],
			message: finding.message,
			detail: finding.detail,
			...span,
			related,
		});
	});
	return marks;
}

/** Everywhere in one cell that a mark of any kind is, with the mark it is part of. */
export function spansIn(marks: Mark[], cell: number): { id: number; at: number; end: number }[] {
	const found: { id: number; at: number; end: number }[] = [];
	for (const mark of marks) {
		if (mark.cell === cell) {
			found.push({ id: mark.id, at: mark.at, end: mark.end });
		}
		for (const one of mark.related) {
			if (one.cell === cell) {
				found.push({ id: mark.id, at: one.at, end: one.end });
			}
		}
	}
	return found;
}

/**
 * One run of text and every mark over it.
 *
 * Marks overlap — a repeated word can also be misspelt, and the author is owed
 * both — but a run of text can only be drawn once. So the spans are cut at every
 * boundary either of them has, and what is drawn is the pieces. Being cut rather
 * than nested, no piece is inside another and each can be laid into the text
 * without disturbing the offsets of the rest.
 */
export interface Segment {
	at: number;
	end: number;
	ids: number[];
}

export function segmentsIn(marks: Mark[], cell: number): Segment[] {
	const spans = spansIn(marks, cell);
	if (spans.length === 0) {
		return [];
	}
	const edges = new Set<number>();
	for (const span of spans) {
		edges.add(span.at);
		edges.add(span.end);
	}
	const points = [...edges].sort((a, b) => a - b);

	const segments: Segment[] = [];
	for (let index = 0; index < points.length - 1; index++) {
		const at = points[index];
		const end = points[index + 1];
		const ids = [
			...new Set(
				spans.filter((span) => span.at <= at && span.end >= end).map((span) => span.id)
			),
		];
		// The gap between two marks that do not touch is text like any other.
		if (ids.length > 0) {
			segments.push({ at, end, ids });
		}
	}
	return segments;
}

/**
 * Where an offset in a cell falls in the file, which is how the server is told
 * what to look at.
 *
 * The inverse of what `placed` does on the way in: a mark comes back from the
 * page knowing only its own cell, and a fix has to name the same span in the
 * coordinates the document is written in.
 */
export function placeInFile(
	cells: Cell[],
	cell: number,
	at: number
): { line: number; character: number } | null {
	const place = placement(cells)[cell];
	if (!place || place.offsets.length === 0) {
		return null;
	}
	let line = 0;
	for (let index = 0; index < place.offsets.length; index++) {
		if (place.offsets[index] <= at) {
			line = index;
		}
	}
	return { line: place.first + line, character: at - place.offsets[line] };
}

export function markOf(marks: Mark[], id: number): Mark | undefined {
	return marks.find((mark) => mark.id === id);
}

/**
 * The paragraph an offset falls in, as the author sees paragraphs: a run of
 * lines with blank ones around it.
 *
 * This is the unit the checks work in — what an edit puts out, and what is asked
 * about again afterwards — because it is the unit the author is writing in. A
 * sentence would be finer than anything they can see the edge of, and a cell
 * coarser than anything they changed.
 */
export function blockAround(
	source: string,
	at: number
): { at: number; end: number; first: number; last: number } {
	const lines = source.split('\n');
	const starts: number[] = [];
	let offset = 0;
	for (const line of lines) {
		starts.push(offset);
		offset += line.length + 1;
	}

	let here = 0;
	for (let index = 0; index < lines.length; index++) {
		if (starts[index] <= at) {
			here = index;
		}
	}

	let first = here;
	while (first > 0 && lines[first - 1].trim() !== '') {
		first -= 1;
	}
	let last = here;
	while (last < lines.length - 1 && lines[last + 1].trim() !== '') {
		last += 1;
	}
	return {
		at: starts[first],
		end: starts[last] + lines[last].length,
		first,
		last,
	};
}

function overlaps(span: Span, cell: number, at: number, end: number): boolean {
	return span.cell === cell && span.at < end && span.end > at;
}

function everywhere(mark: Mark): Span[] {
	return [{ cell: mark.cell, at: mark.at, end: mark.end }, ...mark.related];
}

/**
 * The marks left once a paragraph has been written in.
 *
 * A mark anywhere in that paragraph goes, and so does one whose other half is
 * there — the author fixing one end of a repetition has answered the whole of
 * it, and leaving the far end underlined would be marking prose that is now
 * fine. What is asked again is the paragraph, so what it can put back it will.
 */
export function withoutBlock(
	marks: Mark[],
	cell: number,
	block: { at: number; end: number }
): Mark[] {
	return marks.filter(
		(mark) =>
			!everywhere(mark).some((span) => overlaps(span, cell, block.at, block.end))
	);
}

function shifted(span: Span, cell: number, change: Change): Span | null {
	if (span.cell !== cell) {
		return span;
	}
	if (span.end <= change.at) {
		return span;
	}
	if (span.at >= change.at + change.removed) {
		const by = change.inserted - change.removed;
		return { cell: span.cell, at: span.at + by, end: span.end + by };
	}
	// The change was under it, and what it was about is no longer what is there.
	return null;
}

/**
 * The marks after an edit, each still over the words it was put under.
 *
 * A mark the change fell inside goes, whole: half a repetition is not a
 * repetition, so a change under either end puts both out.
 */
export function moved(marks: Mark[], cell: number, change: Change): Mark[] {
	if (change.removed === 0 && change.inserted === 0) {
		return marks;
	}
	const out: Mark[] = [];
	for (const mark of marks) {
		const spans = everywhere(mark).map((span) => shifted(span, cell, change));
		if (spans.some((span) => span === null)) {
			continue;
		}
		const [head, ...rest] = spans as Span[];
		out.push({ ...mark, at: head.at, end: head.end, related: rest });
	}
	return out;
}

/**
 * What one edit did, read from the text before and after it.
 *
 * Read rather than listened for: a box is typed in, pasted into, dictated into
 * and corrected by the browser itself, and the one thing all of those leave
 * behind is the text they left. The common ends are what did not change, and
 * what is between them is what did.
 */
export function changeBetween(before: string, after: string): Change {
	const most = Math.min(before.length, after.length);
	let at = 0;
	while (at < most && before[at] === after[at]) {
		at += 1;
	}
	let tail = 0;
	while (
		tail < most - at &&
		before[before.length - 1 - tail] === after[after.length - 1 - tail]
	) {
		tail += 1;
	}
	return {
		at,
		removed: before.length - at - tail,
		inserted: after.length - at - tail,
	};
}

/**
 * The text with its segments fenced, ready to be rendered.
 *
 * From the end, so that each fence leaves the offsets before it alone — which is
 * only sound because segments do not overlap. Two marks over one word arrive
 * here as one segment naming both, rather than as two fences that would have to
 * be threaded through each other.
 */
export function fencedMarks(text: string, segments: Segment[]): string {
	let out = text;
	for (const segment of [...segments].sort((a, b) => b.at - a.at)) {
		// A mark over nothing but space would turn a blank line into a paragraph.
		if (!text.slice(segment.at, segment.end).trim()) {
			continue;
		}
		out =
			out.slice(0, segment.at) +
			OPEN +
			segment.ids.join(',') +
			SHUT +
			out.slice(segment.at, segment.end) +
			CLOSE +
			out.slice(segment.end);
	}
	return out;
}

/** The marks a drawn segment names, in the order they were found. */
export function marksOf(marks: Mark[], said: string | null): Mark[] {
	if (!said) {
		return [];
	}
	const found: Mark[] = [];
	for (const part of said.split(',')) {
		const mark = markOf(marks, Number(part));
		if (mark) {
			found.push(mark);
		}
	}
	return found;
}

/**
 * The rendered HTML with its fences turned into marks.
 *
 * Only fences that came through rendering in pairs become marks; one that did
 * not — inside a link's address, which is never shown — is dropped rather than
 * left as a half-open tag.
 */
export function markedProse(html: string): string {
	return html
		.replace(FENCED, '<span class="prose-mark" data-marks="$1">$2</span>')
		.replace(STRAY, '');
}
