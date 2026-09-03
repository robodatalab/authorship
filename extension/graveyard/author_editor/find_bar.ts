// Finding and replacing, on the page.
//
// The editor is a webview and the find widget is the text editor's; nothing
// about Ctrl+F reaches in here. So the widget is ours: this is the box, the
// keys that open it, and the redrawing that puts the highlights where the
// matches are. Where the matches themselves are is find.ts, which is free of the
// DOM and tested without one.

import { isUnderstood, matchesIn, replaced, replacedAll } from './find';
import {
	countEl,
	findBoxEl,
	findEl,
	replaceRowEl,
	replaceToggleEl,
	whatEl,
	withEl,
} from './elements';
import { cellsEl } from './elements';
import { commit } from './edits';
import { redrawCell } from './page_view';
import { state } from './state';
import type { Match, Query } from './find';

/**
 * What is being looked for, and where it is.
 *
 * The query outlives the widget being shut, as it does in the editor next door —
 * an author who closes the box and opens it again is looking for the same thing.
 * `found` is the whole document's worth of matches in reading order, and
 * `current` is the one the author is standing on.
 */
export let query: Query = { text: '', matchCase: false, wholeWord: false, regex: false };
export let found: Match[] = [];
export let current = -1;
export let searching = false;

/**
 * The cells drawn with marks on them.
 *
 * Kept so that a cell which has just lost its last match is redrawn too — the
 * marks are in the HTML of the cell, and nothing else would take them off.
 */
let marks = new Set<number>();
let markedCell: number | null = null;

for (const [id, act] of [
	['find-next', () => step(1)],
	['find-previous', () => step(-1)],
	['find-close', closeFind],
	['find-toggle', () => showReplace(replaceRowEl.hidden === true)],
	['find-replace', replaceCurrent],
	['find-replace-all', replaceEverywhere],
] as const) {
	document.getElementById(id)!.addEventListener('click', act);
}

for (const [id, turned] of [
	['find-case', () => ({ ...query, matchCase: !query.matchCase })],
	['find-word', () => ({ ...query, wholeWord: !query.wholeWord })],
	['find-regex', () => ({ ...query, regex: !query.regex })],
] as const) {
	document.getElementById(id)!.addEventListener('click', () => {
		query = turned();
		research();
	});
}

whatEl.addEventListener('input', () => {
	query = { ...query, text: whatEl.value };
	research();
});

whatEl.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') {
		event.preventDefault();
		step(event.shiftKey ? -1 : 1);
	}
});

withEl.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') {
		event.preventDefault();
		if (event.ctrlKey || event.metaKey || event.altKey) {
			replaceEverywhere();
		} else {
			replaceCurrent();
		}
	}
});

/**
 * Open the widget on whatever is selected.
 *
 * Taking the focus is also what settles a cell that was open for typing: the box
 * writes itself back as it loses focus, so what is searched is the document and
 * not a page that is still ahead of it.
 */
export function openFind(replace: boolean): void {
	const seed = selectedText();
	if (seed) {
		query = { ...query, text: seed };
		whatEl.value = seed;
	}
	searching = true;
	findEl.hidden = false;
	if (replace) {
		showReplace(true);
	}
	research();
	whatEl.focus();
	whatEl.select();
}

export function closeFind(): void {
	searching = false;
	findEl.hidden = true;
	refind();
	repaint(true);
}

function showReplace(on: boolean): void {
	replaceRowEl.hidden = !on;
	replaceToggleEl.classList.toggle('on', on);
	if (on) {
		withEl.focus();
	}
}

function research(): void {
	refind();
	showCount();
	repaint(true);
	reveal();
}

/**
 * Ask the document what it holds now, keeping the author where they were.
 *
 * Where they were is a place in the document rather than a number: an edit
 * anywhere above them would otherwise renumber the matches under their feet and
 * send them back to a chapter they had finished with.
 */
export function refind(): void {
	const was = found[current] ?? null;
	found = searching ? matchesIn(state.cells, query) : [];
	current = was ? nextFrom(was) : found.length > 0 ? 0 : -1;
}

/** The first match at or after a place, wrapping to the top when there is none. */
function nextFrom(place: Match): number {
	const at = found.findIndex(
		(match) =>
			match.cell > place.cell || (match.cell === place.cell && match.at >= place.at)
	);
	return at >= 0 ? at : found.length > 0 ? 0 : -1;
}

export function step(by: number): void {
	if (found.length === 0) {
		return;
	}
	current = (current + by + found.length) % found.length;
	showCount();
	repaint(false);
	reveal();
}

export function showCount(): void {
	if (!searching) {
		return;
	}
	countEl.textContent = !query.text
		? ''
		: found.length === 0
			? 'No results'
			: `${current + 1} of ${found.length}`;
	// An unfinished regular expression is not an error to report; the box says so
	// and the document is left alone until it means something.
	findBoxEl.classList.toggle('invalid', !isUnderstood(query));
	for (const [id, on] of [
		['find-case', query.matchCase],
		['find-word', query.wholeWord],
		['find-regex', query.regex],
	] as const) {
		document.getElementById(id)!.classList.toggle('on', on);
	}
	for (const id of ['find-previous', 'find-next', 'find-replace', 'find-replace-all']) {
		(document.getElementById(id) as HTMLButtonElement).disabled = found.length === 0;
	}
}

/**
 * Redraw the cells whose marks have changed.
 *
 * `everything` when the matches themselves have moved — a new query, or a
 * document that says something else. Stepping from one match to the next only
 * moves which one is current, and then the two cells that changes are the only
 * two worth rebuilding; a search that hits three hundred chapters would
 * otherwise rebuild all three hundred on every press of Enter.
 */
function repaint(everything: boolean): void {
	const wanted = new Set(found.map((match) => match.cell));
	const here = found[current]?.cell ?? null;
	const touched = everything ? new Set([...marks, ...wanted]) : new Set<number>();
	if (markedCell !== null) {
		touched.add(markedCell);
	}
	if (here !== null) {
		touched.add(here);
	}
	marks = wanted;
	markedCell = here;
	for (const index of touched) {
		// Never the cell that is open for typing: it is the author's box, its text
		// is ahead of the document anyway, and rebuilding it takes the caret.
		if (index !== state.editing && state.cells[index]) {
			redrawCell(index);
		}
	}
}

/** Record what a full redraw has just drawn, so the next one knows what to undo. */
export function noteMarks(): void {
	marks = new Set(found.map((match) => match.cell));
	markedCell = found[current]?.cell ?? null;
}

/**
 * Bring the current match on screen without taking the focus off the box.
 *
 * The author is still typing what they are looking for; a match that took the
 * caret with it would put the next keystroke in the manuscript.
 */
function reveal(): void {
	const match = found[current];
	if (!match) {
		return;
	}
	const row = cellsEl.querySelectorAll('.cell')[match.cell];
	const at =
		row?.querySelector('.find-match.current') ??
		row?.querySelector('.find-field.current') ??
		row;
	at?.scrollIntoView({ block: 'center' });
}

function replaceCurrent(): void {
	const match = found[current];
	if (!match) {
		return;
	}
	commit(replaced(state.cells, match, query, withEl.value));
	// Past what was just written, not at it: replacing "the" with "there" would
	// otherwise land on the match it had just made and never move on.
	current = nextFrom({ ...match, at: match.at + withEl.value.length });
	showCount();
	repaint(true);
	reveal();
}

function replaceEverywhere(): void {
	if (found.length === 0) {
		return;
	}
	commit(replacedAll(state.cells, query, withEl.value));
	repaint(true);
	reveal();
}

/** The matches in one of a cell's texts. */
export function foundIn(index: number, field: string | null): Match[] {
	return found.filter((match) => match.cell === index && match.field === field);
}

/**
 * What the author has selected, when it is a line of it worth searching for.
 *
 * The box seeds itself from the selection the way the editor's does. Its own
 * selection is not a seed — opening find twice would then search for whatever it
 * had already highlighted in the box.
 */
function selectedText(): string {
	const focused = document.activeElement;
	if (focused === whatEl || focused === withEl) {
		return '';
	}
	const text =
		focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement
			? focused.value.slice(focused.selectionStart ?? 0, focused.selectionEnd ?? 0)
			: (window.getSelection()?.toString() ?? '');
	return text.includes('\n') ? '' : text;
}
