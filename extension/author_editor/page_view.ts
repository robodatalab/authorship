// Getting what the document says onto the page, and saying where on it the
// author is.
//
// Two ways to draw and the difference between them matters: `render` rebuilds
// everything and is for when the list has changed shape, `redrawCell` replaces
// one section and leaves the rest of the DOM — including whatever the pointer is
// halfway through clicking — exactly where it was. Nearly every bug that reached
// an author in this layer was a full rebuild where one cell would have done.
//
// What a cell is made of is cell_view.ts; this is the page around them.

import { countWords, isStale, placeOf, wordsIn } from './model';
import { cellElement, insertBarFor } from './cell_view';
import { cellsEl, statusEl, topbarEl, whereEl } from './elements';
import { forgetSeam } from './seam_view';
import { noteMarks } from './find_bar';
import { signatureOf, state } from './state';
import { MARKDOWN, type Cell } from '../storydoc/model';

/**
 * Redraw the whole page.
 *
 * Only for when the list of cells has actually changed shape — rebuilding the
 * DOM under a cursor that is mid-click loses the click, so a change to one cell
 * goes through `redrawCell` instead.
 */
export function render(): void {
	const wasAt = window.scrollY;
	cellsEl.textContent = '';
	state.cells.forEach((cell, index) => {
		cellsEl.append(insertBarFor(index));
		cellsEl.append(cellElement(cell, index));
	});
	// The bar below the last cell. With one above every cell as well, every gap in
	// the document has one — including the gap above the first cell, which is the
	// only way a cover gets in front of a title page that is already written.
	cellsEl.append(insertBarFor(state.cells.length));
	showStatus();
	showWhere();
	state.drawn = signatureOf(state.cells);
	forgetSeam();
	noteMarks();
	// Rebuilding resets the scroll; the author was reading somewhere.
	window.scrollTo({ top: wasAt });
}

/** Redraw one cell in place, leaving every other element on the page alone. */
export function redrawCell(index: number): void {
	const existing = cellsEl.querySelectorAll('.cell')[index];
	if (!existing) {
		render();
		return;
	}
	existing.replaceWith(cellElement(state.cells[index], index));
	showStatus();
	showWhere();
	state.drawn = signatureOf(state.cells);
	forgetSeam();
}

/**
 * Put the caret back where it was, after the page has been rebuilt around it.
 *
 * The box is a new element and starts at the top of its text; the author was in
 * the middle of a sentence. Only as far as the text now goes — what arrived may
 * be shorter than what they were typing into.
 */
export function restoreCaret(at: number | null): void {
	const input = state.openBox?.input;
	if (at === null || !input) {
		return;
	}
	const place = Math.min(at, input.value.length);
	input.setSelectionRange(place, place);
}

/**
 * Say at the top of the page which part and chapter is being read.
 *
 * Taken from what is on screen rather than from what is selected: an author
 * scrolling through a hundred thousand words has not clicked on anything, and
 * telling them where they have got to is the whole job of the line.
 *
 * A story with no parts is only ever in a chapter, and says so. Before the first
 * chapter there is nowhere to be, and the line stands empty rather than naming
 * the front matter — the toolbar already has enough to say.
 */
export function showWhere(): void {
	const place = placeOf(state.cells, cellAtTop());
	whereEl.textContent =
		place.chapter === null
			? ''
			: place.part === null
				? place.chapter
				: `${place.part} · ${place.chapter}`;
}

/**
 * The cell the toolbar is sitting on: the last one whose top has gone under it.
 *
 * The toolbar covers the page rather than pushing it down, so what counts as the
 * top of the view is the underside of the toolbar — a chapter measured against
 * the window's top would still be named for a moment after it had scrolled out
 * of sight behind it.
 */
function cellAtTop(): number {
	const line = topbarEl.getBoundingClientRect().bottom;
	let at = 0;
	cellsEl.querySelectorAll('.cell').forEach((row, index) => {
		if (row.getBoundingClientRect().top <= line) {
			at = index;
		}
	});
	return at;
}

/**
 * Redraw what the toolbar says about the document.
 *
 * Drawn on its own as well as with the page, because the count in it moves with
 * the keys and the page does not: a rebuild mid-keystroke would take the caret
 * with it, and this is one line of text.
 */
export function showStatus(): void {
	statusEl.textContent = documentStatus();
}

function documentStatus(): string {
	const chapters = state.cells.filter((cell) => cell.kind === 'chapter').length;
	const stale = state.cells.filter((_cell, index) => isStale(state.cells, index)).length;
	const words = wordsNow();
	const said = [
		`${chapters} ${chapters === 1 ? 'chapter' : 'chapters'}`,
		`${grouped(words)} ${words === 1 ? 'word' : 'words'}`,
	];
	if (stale > 0) {
		said.push(`${stale} to run`);
	}
	return said.join(' · ');
}

/**
 * The last count of the story, and the document and open cell it was made from.
 *
 * `wordsNow` says what it is for, and is the only thing that reads or writes it.
 */
let counted: { cells: Cell[]; editing: number | null; words: number } | null = null;

/**
 * What the story weighs right now, counting the open box as it stands rather
 * than as the document last heard it.
 *
 * A cell is written back to the document 400ms after the last keystroke, and a
 * count that waited for that would sit still through a sentence and then jump.
 * The number an author watches while they write is the one thing on the page
 * that has to keep up with the keys.
 *
 * So the rest of the document is counted once and kept, and only the box being
 * typed in is counted again on each keystroke: a chapter's worth of words per
 * key instead of a novel's. The kept count is thrown away by the two things that
 * can invalidate it — a new document, since `state.cells` is replaced and never
 * changed in place, and a different cell being opened.
 */
function wordsNow(): number {
	const { cells, editing } = state;
	if (!counted || counted.cells !== cells || counted.editing !== editing) {
		counted = { cells, editing, words: wordsIn(cells, editing) };
	}
	return counted.words + wordsTyping();
}

/**
 * The words in the box open for typing, which the document does not have yet.
 *
 * Nothing but markdown is counted anywhere, so a title being typed into weighs
 * nothing here either — `wordsIn` left the cell out, and this puts back only
 * what it would have counted.
 */
function wordsTyping(): number {
	const { cells, editing, openBox } = state;
	if (editing === null || openBox?.index !== editing) {
		return 0;
	}
	return cells[editing]?.kind === MARKDOWN ? countWords(openBox.input.value) : 0;
}

/**
 * A count with its thousands marked, because a manuscript's is six digits long
 * and nobody reads `127450` at a glance.
 *
 * Punctuated here rather than by `toLocaleString`, so the number does not change
 * its shape with the machine the editor was opened on while the words beside it
 * stay English.
 */
function grouped(count: number): string {
	return String(count).replace(/\B(?=(\d{3})+$)/g, ',');
}

/** Move the selection, without rebuilding either cell to say so. */
export function select(index: number): void {
	if (state.selected === index) {
		return;
	}
	state.selected = index;
	for (const other of cellsEl.querySelectorAll('.cell.selected')) {
		other.classList.remove('selected');
	}
	cellsEl.querySelectorAll('.cell')[index]?.classList.add('selected');
}
