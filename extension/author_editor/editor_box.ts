// The box a cell is written in, and what it means to be writing one.
//
// This is the one place the surface is ahead of the document: what is typed
// lives in the textarea until it settles, because a repaint mid-keystroke would
// take the caret with it. Everything here is about that gap — when what is in
// the box goes to the document, when the box may be believed, and what happens
// to the cell around it in the meantime.
//
// A cell is given up by accepting it or by opening another one, and by nothing
// else. Losing the keyboard is not leaving the cell.

import { hasProse, isAutomated } from './model';
import { autosize } from './dom';
import { isCursorKey, isSaveKey, isStepKey, MOVES } from './keys';
import {
	addCursor,
	cursorCount,
	drawCursors,
	dropCursors,
	moveCursors,
	typeEverywhere,
} from './cursors_view';
import {
	drawMarks,
	hideTip,
	markAtPoint,
	markTyping,
	recheckBlock,
	showTip,
} from './marks_view';
import { commit } from './edits';
import { post } from './elements';
import { redrawCell, showHeadingWords, showStatus } from './page_view';
import { signatureOf, state } from './state';
import type { Cell } from '../storydoc/model';

/** How long after the last keystroke an open cell is written to the document. */
const TYPING_DEBOUNCE_MS = 400;

/**
 * The box itself, with the two layers under it that a textarea cannot draw.
 *
 * A textarea can no more underline a word than it can hold a second caret, so
 * the same text is laid out twice more underneath in the same face — marks on
 * the lower layer, the cursors Ctrl+D has taken on the upper — and a place drawn
 * on either is the place the box has it.
 */
export function sourceFor(cell: Cell, index: number): HTMLElement {
	// The document this box was opened against. If it moves on, nothing typed in
	// here may be written back over what replaced it.
	const opened = state.generation;
	const box = document.createElement('div');
	box.className = 'source-box';
	const layer = document.createElement('div');
	layer.className = 'source-cursors';
	layer.setAttribute('aria-hidden', 'true');
	// Beneath the cursors, so a place being typed into still reads over a marked
	// word.
	const marksLayer = document.createElement('div');
	marksLayer.className = 'source-marks';
	marksLayer.setAttribute('aria-hidden', 'true');

	const input = document.createElement('textarea');
	input.className = 'source';
	input.value = cell.source;
	input.rows = 1;
	// What the box said before the keystroke, so that what the keystroke did can
	// be read off it.
	let was = cell.source;
	input.addEventListener('input', () => {
		autosize(input);
		markTyping(index, was, input.value);
		was = input.value;
		drawMarks(input, marksLayer, index);
		drawCursors(input, layer);
		// The document hears about this cell 400ms from now; the count in the
		// toolbar, and the counts on the chapter and part above the box, hear
		// about it as it is typed.
		showStatus();
		showHeadingWords();
		if (state.typingTimer !== undefined) {
			clearTimeout(state.typingTimer);
		}
		state.typingTimer = setTimeout(() => {
			if (opened === state.generation) {
				settle(index, input.value);
			}
		}, TYPING_DEBOUNCE_MS);
	});
	// A box cannot be typed into in two places at once, so the keystroke is taken
	// off it and put in by hand.
	input.addEventListener('beforeinput', (event) =>
		typeEverywhere(event, input, layer)
	);
	input.addEventListener('keydown', (event) => {
		// Ctrl+S is VS Code's, and it saves the document as it stands — which is
		// behind this box, since a cell reaches the document on a timer. The cell
		// is written down now so what lands on disk is what is on the screen, and
		// the save is asked for again behind that write.
		if (isSaveKey(event)) {
			if (opened === state.generation) {
				flush(index, input.value);
			}
			post({ type: 'save' });
			return;
		}
		if (isCursorKey(event)) {
			event.preventDefault();
			addCursor(input, layer);
			return;
		}
		// Escape gives up the other cursors before it gives up the cell.
		if (event.key === 'Escape' && cursorCount() > 1) {
			event.preventDefault();
			dropCursors(layer);
			return;
		}
		// A step left or right is taken by every cursor at once. Anything else that
		// goes somewhere — a line, a word, a selection reached for with shift — is
		// going to one place, and gives the others up.
		if (cursorCount() > 1 && isStepKey(event)) {
			event.preventDefault();
			moveCursors(input, layer, event.key === 'ArrowLeft' ? -1 : 1);
			return;
		}
		if (MOVES.has(event.key)) {
			dropCursors(layer);
		}
		// Accept the cell the way a notebook accepts one, and leave Enter to do
		// what Enter does in prose.
		if (event.key === 'Escape' || (event.key === 'Enter' && event.shiftKey)) {
			event.preventDefault();
			if (opened === state.generation) {
				accept(index, input.value);
			}
		}
	});
	// Clicking is choosing one place to type in.
	input.addEventListener('mousedown', () => dropCursors(layer));
	// Losing the keyboard is not leaving the cell. A notebook keeps the author in
	// the cell they are in, and almost nothing that takes the focus off this box
	// is them saying they have finished with it: a click on the toolbar, the find
	// field, the editor alongside, another window — or VS Code taking the focus
	// back for a keystroke of its own, which is what Ctrl+S was doing.
	input.addEventListener('blur', () => {
		if (opened === state.generation) {
			flush(index, input.value);
		}
	});
	// Both once the box is on the page: `scrollHeight` needs a laid-out element,
	// and `preventScroll` because focusing is what was yanking the page around.
	queueMicrotask(() => {
		autosize(input);
		input.focus({ preventScroll: true });
		drawMarks(input, marksLayer, index);
	});
	state.openBox = { input, layer: marksLayer, index };

	// The box is on top and takes every event, and the layer under it is not there
	// to be touched — so what the pointer is over is worked out from where the
	// marks were drawn rather than from what it reached.
	input.addEventListener('mousemove', (event) => {
		const over = markAtPoint(marksLayer, event.clientX, event.clientY);
		if (over) {
			showTip(over.marks, over.at);
		} else {
			hideTip();
		}
	});
	input.addEventListener('mouseleave', hideTip);

	box.append(marksLayer, layer, input);
	return box;
}

/** Whether a cell is the author's to type into at all. */
export function writable(index: number): boolean {
	const cell = state.cells[index];
	// A built cell is the document's to write, not the author's to type into.
	if (!cell || isAutomated(cell.kind) || !hasProse(cell.kind)) {
		return false;
	}
	// Nor is any of them while a pass is correcting the whole document: every
	// section is about to be replaced in turn.
	if (state.styling !== null) {
		return false;
	}
	// Neither is one the server is writing, until it has finished: what is typed
	// into it now is either lost under what comes back or written over it.
	return state.writing?.at !== index;
}

/** Open a cell for writing, if it is the author's to write. */
export function beginEditing(index: number): void {
	if (!writable(index)) {
		return;
	}
	dropCursors();
	const was = state.editing;
	// What was typed in the cell being left is written down before that cell is
	// drawn again, or it would be drawn from the text it held a moment ago —
	// taking the box away fires its blur, and that lands after the redraw.
	if (was !== null && was !== index && state.openBox?.index === was) {
		flush(was, state.openBox.input.value);
	}
	state.editing = index;
	state.selected = index;
	if (was !== null && was !== index) {
		redrawCell(was);
	}
	redrawCell(index);
}

/**
 * Cut the open box loose, leaving the author in the cell.
 *
 * For when the page is about to be rebuilt around them. The textarea's own
 * handlers are still attached to a cell that is about to say something else, and
 * letting their blur or their timer write back would put the author's abandoned
 * text over whatever arrived.
 */
export function releaseBox(): void {
	dropCursors();
	hideTip();
	state.openBox = null;
	state.generation += 1;
	if (state.typingTimer !== undefined) {
		clearTimeout(state.typingTimer);
		state.typingTimer = undefined;
	}
}

/** Shut whatever cell is open for typing, and cut its box loose. */
export function closeEditing(): void {
	if (state.editing === null) {
		return;
	}
	releaseBox();
	state.editing = null;
}

/**
 * Where the open cell has gone, now the shape of the document has changed.
 *
 * An author who moves, splits, or merges around the cell they are writing in has
 * not stopped writing in it, so the box follows its cell rather than staying at
 * an index that now means some other cell. Only the cell being deleted out from
 * under them takes them out of it.
 */
export function followEditing(to: (at: number) => number | null): void {
	if (state.editing === null) {
		return;
	}
	const at = to(state.editing);
	if (at === null) {
		closeEditing();
	} else {
		state.editing = at;
	}
}

/** Write what has been typed without closing the cell. */
function settle(index: number, source: string): void {
	if (state.cells[index] && state.cells[index].source !== source) {
		const next = [...state.cells];
		next[index] = { ...state.cells[index], source };
		// The box the author is typing in already says this, so what comes back is
		// not news — recorded before it goes, or the echo would repaint the cell
		// out from under the caret.
		state.drawn = signatureOf(next);
		commit(next);
		recheckBlock(index, source);
	}
}

/**
 * Write down what is in the box without leaving the cell.
 *
 * The author who clicked the toolbar, opened find, pressed Ctrl+S, or went to
 * another window is still writing this cell — they have only stopped touching
 * the keyboard for a moment. What they have typed goes to the document, because
 * nothing is watching for it any more, and the box stays where it is.
 */
export function flush(index: number, source: string): void {
	if (state.typingTimer !== undefined) {
		clearTimeout(state.typingTimer);
		state.typingTimer = undefined;
	}
	settle(index, source);
}

/** Take the cell as written and shut it, the way a notebook accepts a cell. */
function accept(index: number, source: string): void {
	dropCursors();
	if (state.typingTimer !== undefined) {
		clearTimeout(state.typingTimer);
		state.typingTimer = undefined;
	}
	// Only if this cell is still the open one. Moving from one cell to the next
	// closes this one by taking its textarea away, and the blur that fires must
	// not close the cell that has just been opened instead.
	if (state.editing === index) {
		state.editing = null;
	}
	settle(index, source);
	redrawCell(index);
}
