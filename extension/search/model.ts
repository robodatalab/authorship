// Turning the passages a search found into the rows of the Search drawer.
//
// Deliberately free of the `vscode` module, so what a row says and what an edit
// does to it can be read and tested without launching an editor. Everything here
// deals in plain numbers and strings; results.ts turns them into a drawer, a
// jump, and a highlight.

import type { LineEdit } from '../document/edits';

/** A passage that answers the phrase, as the server ranked it. */
export interface Hit {
	/** 0-based lines of the manuscript, both ends inclusive. */
	start: number;
	end: number;
	/** Cosine of the passage against the phrase. An ordering, not a percentage. */
	score: number;
	text: string;
}

export interface SearchResults {
	hits: Hit[];
	/** Lines of prose the server has yet to encode. */
	pending: number;
}

/**
 * Read the server's answer into the rows the picker draws.
 *
 * Anything unusable is dropped rather than failing the search: a partial answer
 * is worth showing, and there is nothing the author could do about a malformed
 * one anyway.
 */
export function normalize(raw: unknown): SearchResults {
	const body = raw as { hits?: unknown; pending?: unknown } | null;
	const hits: Hit[] = [];

	for (const entry of Array.isArray(body?.hits) ? body.hits : []) {
		const hit = entry as Record<string, unknown> | null;
		const start = Number(hit?.start);
		const end = Number(hit?.end);
		// A passage running backwards says nothing about which lines were meant.
		if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
			continue;
		}
		hits.push({
			start,
			end,
			score: Number(hit?.score) || 0,
			text: String(hit?.text ?? ''),
		});
	}

	return { hits, pending: Number(body?.pending) || 0 };
}

/** How much of a passage a row shows before it is cut. */
export const LABEL_LIMIT = 120;

/**
 * The passage on a single line.
 *
 * A row is one line of a list, so the paragraph breaks inside a passage come out
 * as spaces, and a passage longer than the row can hold is cut rather than
 * allowed to push the line numbers off the end.
 */
export function rowLabel(hit: Hit): string {
	const flat = hit.text.replace(/\s+/g, ' ').trim();
	if (flat.length <= LABEL_LIMIT) {
		return flat;
	}
	return flat.slice(0, LABEL_LIMIT - 1).trimEnd() + '…';
}

/** Where the passage is, counting from one as the editor's own gutter does. */
export function rowDescription(hit: Hit): string {
	return hit.start === hit.end
		? `line ${hit.start + 1}`
		: `lines ${hit.start + 1}–${hit.end + 1}`;
}

/**
 * What the drawer says about a search while the server is still encoding.
 *
 * The answer improves on its own as the indexing job gets through the
 * manuscript, and a search that says nothing about that reads as a search that
 * found little — rather than one that has not been told everything yet.
 */
export function progress(pending: number): string {
	if (pending <= 0) {
		return '';
	}
	return `Encoding the manuscript — ${pending} ${
		pending === 1 ? 'line' : 'lines'
	} to go`;
}

/**
 * The results that still describe the manuscript after an edit.
 *
 * A passage that has been written in is no longer the passage that was found, so
 * it goes rather than being carried forward pointing at prose that has changed
 * under it. Passages below the edit keep their place in the answer and move down
 * or up with the words; passages above it are untouched.
 *
 * Edits arriving in one change event are all expressed against the document as
 * it was, so they are applied last-first and each one's line numbers still mean
 * what they said.
 */
export function afterEdits(hits: Hit[], edits: LineEdit[]): Hit[] {
	let surviving = hits;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		const kept = surviving.filter((hit) => !touches(hit, edit));
		const moved = kept.map((hit) => (hit.start > edit.end ? shift(hit, edit.delta) : hit));
		// The same array back when nothing was dropped and nothing moved, so the
		// caller can tell an edit that reached the results from one that did not.
		const untouched =
			kept.length === surviving.length &&
			moved.every((hit, index) => hit === kept[index]);
		surviving = untouched ? surviving : moved;
	}
	return surviving;
}

function touches(hit: Hit, edit: LineEdit): boolean {
	return hit.start <= edit.end && hit.end >= edit.start;
}

function shift(hit: Hit, delta: number): Hit {
	return delta === 0 ? hit : { ...hit, start: hit.start + delta, end: hit.end + delta };
}
