// The cell surface, running inside the webview.
//
// What is left here is what belongs to the surface as a whole and to no part of
// it: the toolbar above the cells, the keys and the pointer at the level of the
// page, and the channel to the host. Everything the surface is made of is
// beside this file —
//
//   state.ts        what is on the page, for the parts that need the answer
//   page_view.ts    drawing the list, and saying where in it the author is
//   cell_view.ts    what one cell is made of, whatever kind of cell it is
//   editor_box.ts   the box a cell is written in, and what writing one means
//   edits.ts        changing the document, and telling the host
//   seam_view.ts    dividing a section, or joining it to the one above
//   find_bar.ts     the find widget, since Ctrl+F does not reach a webview
//   marks_view.ts   what the checks found, drawn and explained and fixable
//   cursors_view.ts typing into several places in one cell at once
//   menu_view.ts    the menu on a right-click and on the insert bar's "…"
//   dom.ts          the small pieces all of them build out of
//   keys.ts         which keystroke is which
//   elements.ts     the page itself, and the wire back to the host
//
// The toolbar is in here, above the cells, the way a notebook's is. It was in
// the editor title bar for a while, where VS Code drew it — but that bar is
// shared with every other extension and with VS Code's own buttons, so what got
// shown was not ours to decide, and tools kept disappearing into an overflow.
//
// The host owns the truth. A cell being typed into is the one exception — it
// holds its own text until it settles, because a repaint mid-keystroke would
// take the caret with it. Everything else is drawn from what the host last sent.

import { withDefaultCell } from './model';
import { checkEl, post, toolbarEl } from './elements';
import { closeFind, openFind, refind, searching, showCount, step } from './find_bar';
import { closeMenu, menuHolds, menuIsOpen } from './menu_view';
import { isFindKey, isReplaceKey } from './keys';
import { applyFix, receiveFindings, setChecking } from './marks_view';
import { beginEditing, closeEditing, releaseBox, writable } from './editor_box';
import { redrawCell, render, restoreCaret, showWhere } from './page_view';
import { signatureOf, state } from './state';
import type { Cell } from '../storydoc/model';
import type { Finding } from './marks';

// --- the toolbar ---

for (const [id, type] of [
	['run-all', 'compile'],
	['import-markdown', 'importMarkdown'],
	['export-markdown', 'exportMarkdown'],
	['export-epub', 'exportEpub'],
	['export-parts', 'partition'],
	['as-text', 'openAsText'],
] as const) {
	document.getElementById(id)!.addEventListener('click', () => post({ type }));
}

// Turning the checks on is the author saying they want to be told. Drafting is
// the other half of writing, and nothing is checked until they ask.
checkEl.addEventListener('click', () => post({ type: 'checkToggle' }));

// Keep a click on the toolbar from also being the click that dismisses a menu.
toolbarEl.addEventListener('mousedown', (event) => event.stopPropagation());

// --- the page ---

// Measuring every cell is a page-wide layout, and scrolling asks for one far
// faster than the page can be repainted; the frame is the most often it can
// usefully be answered.
let following = false;
window.addEventListener('scroll', () => {
	if (following) {
		return;
	}
	following = true;
	requestAnimationFrame(() => {
		following = false;
		showWhere();
	});
});

document.addEventListener('click', (event) => {
	if (menuIsOpen() && !menuHolds(event.target as Node)) {
		closeMenu();
	}
});

// A cell stays open when the page loses the keyboard, so it takes the keyboard
// back when the page has it again — the author who pressed Ctrl+S, or came back
// from another window, carries on typing where they were. Only when nothing else
// on the page has claimed it in the meantime.
window.addEventListener('focus', () => {
	const input = state.openBox?.input;
	const idle =
		document.activeElement === null || document.activeElement === document.body;
	if (input && idle) {
		input.focus({ preventScroll: true });
	}
});

document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && menuIsOpen()) {
		closeMenu();
		return;
	}
	if (isReplaceKey(event)) {
		event.preventDefault();
		openFind(true);
		return;
	}
	if (isFindKey(event)) {
		event.preventDefault();
		openFind(false);
		return;
	}
	if (searching && event.key === 'Escape') {
		event.preventDefault();
		closeFind();
		return;
	}
	if (searching && event.key === 'F3') {
		event.preventDefault();
		step(event.shiftKey ? -1 : 1);
		return;
	}
	// The keyboard way into a cell, since the mouse way is now a double-click.
	// Not while something is already taking the keys.
	const typing =
		event.target instanceof HTMLTextAreaElement ||
		event.target instanceof HTMLInputElement;
	if (event.key === 'Enter' && !typing && state.editing === null) {
		event.preventDefault();
		beginEditing(state.selected);
	}
});

// --- what the host says ---

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'writing') {
		writingChanged(message);
	} else if (message?.type === 'cells') {
		cellsArrived(message);
	} else if (message?.type === 'checking') {
		setChecking(message.on as boolean);
	} else if (message?.type === 'marks') {
		receiveFindings(message.findings as Finding[], Boolean(message.whole));
	} else if (message?.type === 'fixed') {
		applyFix(message.id as number, message.text as string);
	}
});

/** The server has started, moved on with, or finished writing a cell. */
function writingChanged(message: Record<string, unknown>): void {
	const was = state.writing?.at ?? null;
	state.writing =
		message.at === null
			? null
			: {
					at: message.at as number,
					written: (message.written as number) ?? 0,
					chapters: (message.chapters as number) ?? 0,
				};
	// A cell open for typing when the server starts writing it is taken away
	// from the author, box and all — leaving it open would be inviting them
	// to write something the blurb is about to land on top of.
	if (state.writing !== null && state.editing === state.writing.at) {
		closeEditing();
	}
	// The cell that has stopped has its run button to get back, and it is not
	// always the cell that has started.
	if (was !== null && was !== state.writing?.at) {
		redrawCell(was);
	}
	if (state.writing) {
		redrawCell(state.writing.at);
	}
}

/** The document, as the host has just read it back out of the file. */
function cellsArrived(message: Record<string, unknown>): void {
	const incoming = withDefaultCell(message.cells as Cell[]);
	state.base = String(message.base ?? '');
	// Most of what arrives here is this view's own edit coming back around,
	// which is not news and must not disturb a cell being typed in.
	if (signatureOf(incoming) === state.drawn) {
		state.cells = incoming;
		return;
	}
	// The document says something the view did not write — reverted, corrected,
	// or edited elsewhere. That wins over the text in an open box, which would
	// otherwise write the old words back the moment the author clicked away.
	// It does not win over the author being in the cell: the page is rebuilt
	// around them and the box opened again on what the document now says, with
	// the caret where they left it. A rebuild is not a reason to stop writing.
	const at = state.editing;
	const caret = state.openBox?.input.selectionStart ?? null;
	releaseBox();
	state.cells = incoming;
	state.selected = Math.min(state.selected, Math.max(0, state.cells.length - 1));
	state.editing = at !== null && writable(at) ? at : null;
	refind();
	showCount();
	render();
	restoreCaret(caret);
}

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
post({ type: 'ready' });
