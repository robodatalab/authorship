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
//   job_view.ts     a pass over the whole document, drawn and stoppable
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

import { generatedCell, withDefaultCell } from './model';
import { useTemplates } from '../../settings/model';
import { checkEl, post, styleEl, toolbarEl } from './elements';
import { closeFind, openFind, refind, searching, showCount, step } from './find_bar';
import { drawJob, setStyling } from './job_view';
import { closeMenu, menuHolds, menuIsOpen } from './menu_view';
import { isFindKey, isReplaceKey } from './keys';
import { applyFix, receiveFindings, setChecking } from './marks_view';
import { beginEditing, closeEditing, releaseBox, writable } from './editor_box';
import { redrawCell, render, restoreCaret, showWhere } from './page_view';
import { foldAllCells } from './edits';
import { signatureOf, state } from './state';
import type { Cell } from '../storydoc_model';
import type { Templates } from '../../settings/model';
import type { Finding } from './marks';

// --- the toolbar ---

// Folding is an edit the page makes for itself, like moving a cell — it does
// not go out to the host and come back.
for (const [id, on] of [
	['fold-all', true],
	['unfold-all', false],
] as const) {
	document.getElementById(id)!.addEventListener('click', () => foldAllCells(on));
}

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

// Correcting the whole manuscript. Its own button rather than a section's run
// button, because it is the one tool here that is about the document rather than
// about a cell of it — and the host, not this, is what asks Gemini.
//
// Hidden until the host says otherwise: it is an experimental feature and off by
// default, and a tool that is off should not be a tool that is greyed out. The
// page starts with it hidden rather than waiting to be told, so it never flashes
// into view on a document opened with the experiment off.
styleEl.hidden = true;
styleEl.addEventListener('click', () => post({ type: 'fixStyle' }));

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
	} else if (message?.type === 'styling') {
		setStyling(
			message.on
				? {
						written: (message.written as number) ?? 0,
						chapters: (message.chapters as number) ?? 0,
						note: (message.note as string | null) ?? null,
					}
				: null
		);
	} else if (message?.type === 'templates') {
		// What a blank disclaimer or author page says in this workspace. Only the
		// host can read the file, so what it last said is what the menus build
		// from.
		useTemplates(message.templates as Templates);
	} else if (message?.type === 'features') {
		styleEl.hidden = !message.styleFix;
	} else if (message?.type === 'checking') {
		setChecking(message.on as boolean);
	} else if (message?.type === 'wanting') {
		state.wanting = new Set(message.kinds as string[]);
		render();
	} else if (message?.type === 'marks') {
		receiveFindings(message.findings as Finding[], Boolean(message.whole));
	} else if (message?.type === 'fixed') {
		applyFix(message.id as number, message.text as string);
	}
});

/** The server has started, moved on with, or finished writing a cell. */
function writingChanged(message: Record<string, unknown>): void {
	const was = state.writing?.at ?? null;
	// No cell reads the same as no job. The host says which cell the writing is
	// going into by looking for it, and a job whose cell the author has deleted
	// is a job with nowhere to draw a bar — there is no section left to draw it
	// above, whatever the server is still doing about it.
	const at = message.at as number | null;
	state.writing =
		at === null || at < 0
			? null
			: {
					at,
					kind: (message.kind as string) ?? '',
					written: (message.written as number) ?? 0,
					chapters: (message.chapters as number) ?? 0,
				};
	// A cell open for typing when the server starts writing it is taken away
	// from the author, box and all — leaving it open would be inviting them
	// to write something the answer is about to land on top of.
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
	// Before anything is drawn from it, because what is drawn depends on it: the
	// cell being written is held as an index, and the document that has just
	// arrived need not be the one that index was taken from.
	followWriting(incoming);
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
	// The bar is the host's news rather than the document's, so a rebuild has to
	// put back the lock the rebuild just cleared off the page.
	drawJob();
	restoreCaret(caret);
}

/**
 * Keep the bar on the cell being written, wherever the document has moved it to.
 *
 * Writing a section takes minutes, and the document around it stays the author's
 * the whole time — so the cell being written into can be pushed down by one
 * added above it, pulled up by one taken out, or carried off by a split. The
 * index alone does not survive that: left where it was it names whatever cell
 * has moved into the slot, and the bar, the stop button and the write-lock all
 * go to that one.
 *
 * Found by kind rather than followed through each edit. The kind is what the job
 * is actually for and a document has one cell of it, so this is right about
 * edits nobody thought of here — including the ones made in a text editor
 * alongside, which never pass through this page at all. An index carried along
 * by each command would be right about the commands it was taught and quietly
 * wrong about the next one added.
 *
 * The host looks the same cell up for itself before it puts the writing
 * anywhere; this is the half of it the author can see, and it is done here
 * because a chapter is minutes and the bar cannot wait that long to be right.
 */
function followWriting(cells: Cell[]): void {
	const writing = state.writing;
	if (writing === null) {
		return;
	}
	// The rule the host places the writing by, so the bar is drawn on the cell
	// the writing is actually going into rather than beside it.
	const at = generatedCell(cells, writing.at, writing.kind);
	state.writing = at < 0 ? null : { ...writing, at };
}

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
post({ type: 'ready' });
