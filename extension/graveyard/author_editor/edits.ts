// Changing the document.
//
// Every change to the cells goes out through `commit`, so there is one place
// where the host is told and one place where what has been found is asked for
// again. A part of the surface that edited the list and posted it itself would
// be a part that could forget the second half.
//
// The commands beneath it are the structural ones — a cell added, taken out, or
// moved. Each of them says where the author should be left afterwards, because
// an author who moves a cell has not stopped writing in it.

import { foldAt, foldEvery, insertAt, moveBy, removeAt } from './model';
import { post } from './elements';
import { refind, showCount } from './find_bar';
import { followEditing } from './editor_box';
import { state } from './state';
import type { Cell } from '../storydoc/model';

export function commit(next: Cell[]): void {
	// Nothing on the page is the author's to change while a pass is correcting
	// the whole of it. Refused here rather than at each button, because this is
	// the one place every change goes through — and a replace-all that got past a
	// disabled toolbar would otherwise write over the chapter being corrected.
	if (state.styling !== null) {
		return;
	}
	state.cells = next;
	post({ type: 'cells', cells: next });
	// What was found is found in the document, so it is asked again whenever the
	// document says something else. The marks themselves are left to whoever
	// redraws — a cell repainted here would be a cell repainted mid-keystroke.
	refind();
	showCount();
}

/** Add a cell, and select it — it is the one the author is about to write in. */
export function insertCell(at: number, cell: Cell): void {
	state.selected = at;
	followEditing((open) => (open >= at ? open + 1 : open));
	commit(insertAt(state.cells, at, cell));
}

/**
 * Take a cell out, leaving the author on the one above it.
 *
 * A cell deleted out from under them is the one way, other than accepting it or
 * opening another, that they stop writing one.
 */
export function deleteCell(index: number): void {
	state.selected = Math.max(0, index - 1);
	followEditing((open) =>
		open === index ? null : open > index ? open - 1 : open
	);
	commit(removeAt(state.cells, index));
}

/**
 * Fold a section away to its heading, or unfold it.
 *
 * A change to the document like any other, because that is where the fold is
 * kept — so it undoes, it saves, and it travels with the cell when the cell is
 * moved. A section folded while it was open for writing closes: the box it was
 * being typed in is the very thing folding it takes away.
 */
export function foldCell(index: number, on: boolean): void {
	if (on && state.editing === index) {
		followEditing(() => null);
	}
	commit(foldAt(state.cells, index, on));
}

/**
 * Fold every section away, or unfold every one.
 *
 * Two buttons rather than one that changes its mind. A single toggle has to be
 * read before it can be pressed — the author has to work out which way it is
 * pointing this time — and a toolbar is a place for buttons that always do the
 * same thing.
 */
export function foldAllCells(on: boolean): void {
	if (on && state.editing !== null) {
		followEditing(() => null);
	}
	commit(foldEvery(state.cells, on));
}

/** Move a cell, keeping the selection on it rather than on where it used to be. */
export function moveCell(index: number, by: number): void {
	const next = moveBy(state.cells, index, by);
	if (next === state.cells) {
		return;
	}
	state.selected = index + by;
	// The two that swapped swap the box between them along with everything else.
	followEditing((open) =>
		open === index ? index + by : open === index + by ? index : open
	);
	commit(next);
}
