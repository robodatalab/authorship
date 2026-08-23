// Typing into several places in one cell at once, on the page.
//
// cursors.ts works out where the places are and what the text becomes; this puts
// that on screen and takes the keystrokes off the box. The two are apart because
// the first can be tested without a DOM and the second cannot.
//
// The places belong to the cell that is open: it is shut, and they are gone.

import { edited, nextOccurrence } from './cursors';
import type { Cursor } from './cursors';

/**
 * The places in the open cell that are typed into at once, and which of them the
 * box's own caret is on.
 *
 * Fewer than two is no more than a box does by itself, and none of this is in
 * the way.
 */
let cursors: Cursor[] = [];
let leading = -1;
/**
 * How much of what was taken lies each side of the caret.
 *
 * One pair for all of them, because they all took the same keys and all stand at
 * the same spot in the same word. It is what turns a caret back into something
 * an author can see: the word being changed, drawn at every place, with the
 * caret somewhere inside it.
 */
let runBefore = 0;
let runAfter = 0;

/** How many places are being typed into. Fewer than two is a box being a box. */
export function cursorCount(): number {
	return cursors.length;
}

/**
 * Take the next place the cell says what the author has selected.
 *
 * The selection is the whole of the question. With nothing selected there is
 * nothing to look for, and taking the word under the caret instead would be
 * taking a word nobody asked for.
 *
 * The box is asked what it has selected every time rather than trusted to have
 * left it where it was put: between one press and the next the author may have
 * changed it, and what they are pointing at now is what they mean.
 */
export function addCursor(input: HTMLTextAreaElement, layer: HTMLElement): void {
	const text = input.value;
	const at = input.selectionStart ?? 0;
	const end = input.selectionEnd ?? 0;
	if (at === end) {
		return;
	}

	if (cursors.length === 0) {
		cursors = [{ at, end }];
		leading = 0;
		runBefore = 0;
		runAfter = 0;
	} else {
		cursors[leading] = { at, end };
	}

	const taken = cursors[leading];
	const next = nextOccurrence(text, text.slice(taken.at, taken.end), cursors);
	if (!next) {
		return;
	}
	cursors.push(next);
	leading = cursors.length - 1;
	input.setSelectionRange(next.at, next.end);
	drawCursors(input, layer);
	// A cell can be a chapter long, and the place just taken is no use behind the
	// bottom of the window.
	layer.querySelector('.leading')?.scrollIntoView({ block: 'nearest' });
}

export function dropCursors(layer?: HTMLElement): void {
	cursors = [];
	leading = -1;
	runBefore = 0;
	runAfter = 0;
	if (layer) {
		layer.textContent = '';
	}
}

/**
 * Put what was typed in at every cursor.
 *
 * Only what can honestly be done in several places at once: letters, a return, a
 * paste, and the two keys that delete a character. Anything else — a word
 * deleted, an undo — is the box's to do, and giving the other cursors up is
 * truer than doing half of it.
 */
export function typeEverywhere(
	event: InputEvent,
	input: HTMLTextAreaElement,
	layer: HTMLElement
): void {
	if (cursors.length < 2) {
		return;
	}
	const typed = typedIn(event);
	if (typed === null) {
		dropCursors(layer);
		return;
	}
	event.preventDefault();
	cursors[leading] = {
		at: input.selectionStart ?? 0,
		end: input.selectionEnd ?? 0,
	};
	const reach =
		event.inputType === 'deleteContentBackward'
			? -1
			: event.inputType === 'deleteContentForward'
				? 1
				: 0;
	// What is taken follows the keys: typing over a selection makes what is typed
	// the whole of it, and after that it grows and shrinks around the caret.
	if (cursors.some((cursor) => cursor.end > cursor.at)) {
		runBefore = typed.length;
		runAfter = 0;
	} else if (event.inputType === 'deleteContentBackward') {
		runBefore = Math.max(0, runBefore - 1);
	} else if (event.inputType === 'deleteContentForward') {
		runAfter = Math.max(0, runAfter - 1);
	} else {
		runBefore += typed.length;
	}
	const next = edited(input.value, cursors, typed, reach);
	input.value = next.text;
	cursors = next.cursors;
	const here = cursors[leading];
	input.setSelectionRange(here.at, here.end);
	// The keystroke the box would have seen, so that it grows and settles on its
	// own schedule as though it had been typed into.
	input.dispatchEvent(new Event('input'));
}

function typedIn(event: InputEvent): string | null {
	switch (event.inputType) {
		case 'insertText':
			return event.data ?? '';
		case 'insertLineBreak':
		case 'insertParagraph':
			return '\n';
		case 'insertFromPaste':
			return event.dataTransfer?.getData('text') ?? '';
		case 'deleteContentBackward':
		case 'deleteContentForward':
			return '';
		default:
			return null;
	}
}

/**
 * Draw what is taken, at every place but under the author's own caret.
 *
 * A place shows what is selected there, or — once that has been typed over — the
 * run the keys have been going into, which is the same run at every place. A
 * caret alone is a line an author has to hunt for; the words they are changing
 * are what they can see.
 *
 * The text is laid out again around them, so that a place drawn here is under
 * the same word there. The caret is a character of no width, cut into what is
 * taken where it stands rather than left at the end of it.
 */
export function drawCursors(input: HTMLTextAreaElement, layer: HTMLElement): void {
	layer.textContent = '';
	if (cursors.length < 2) {
		return;
	}
	const text = input.value;
	const order = cursors
		.map((cursor, index) => ({ cursor, index }))
		.sort((a, b) => a.cursor.at - b.cursor.at);
	let read = 0;

	const taken = (from: number, to: number, leads: boolean): void => {
		const span = document.createElement('span');
		span.className = leads ? 'at leading' : 'at';
		span.textContent = text.slice(from, to);
		layer.append(span);
	};

	for (const { cursor, index } of order) {
		const empty = cursor.end === cursor.at;
		// The caret stands at the far end of a selection, and at itself otherwise.
		const caret = cursor.end;
		if (caret < read) {
			continue;
		}
		const from = Math.max(read, Math.min(empty ? cursor.at - runBefore : cursor.at, caret));
		const to = Math.min(text.length, Math.max(empty ? cursor.at + runAfter : cursor.end, caret));

		layer.append(document.createTextNode(text.slice(read, from)));
		if (caret > from) {
			taken(from, caret, index === leading);
		}
		// The box draws its own caret, and a second under it would be two carets
		// in one place.
		if (index !== leading) {
			const bar = document.createElement('span');
			bar.className = 'caret';
			bar.textContent = '\u200b';
			layer.append(bar);
		}
		if (to > caret) {
			taken(caret, to, index === leading);
		}
		read = to;
	}

	layer.append(document.createTextNode(text.slice(read)));
}

/**
 * Move every cursor the same way at once.
 *
 * They all took the same keys and all stand at the same spot in the same word,
 * so they all move together; what is taken stays where it is in the text while
 * the caret walks through it. A selection collapses to the end it is moving
 * towards, as it does anywhere.
 */
export function moveCursors(input: HTMLTextAreaElement, layer: HTMLElement, by: number): void {
	const text = input.value;
	const held = cursors.some((cursor) => cursor.end > cursor.at);
	if (held) {
		const length = cursors[leading].end - cursors[leading].at;
		runBefore = by < 0 ? 0 : length;
		runAfter = by < 0 ? length : 0;
	} else {
		runBefore += by;
		runAfter -= by;
	}
	cursors = cursors.map((cursor) => {
		const to = cursor.end > cursor.at
			? by < 0
				? cursor.at
				: cursor.end
			: Math.min(text.length, Math.max(0, cursor.at + by));
		return { at: to, end: to };
	});
	const here = cursors[leading];
	input.setSelectionRange(here.at, here.end);
	drawCursors(input, layer);
}
