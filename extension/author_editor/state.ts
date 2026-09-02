// What the surface currently holds, in one place because more than one part of
// it needs the answer.
//
// The host owns the truth. A cell being typed into is the one exception — it
// holds its own text until it settles, because a repaint mid-keystroke would
// take the caret with it. Everything else here is drawn from what the host last
// sent, and every field is written by exactly one part of the surface even
// though several read it.
//
// A leaf, deliberately: it imports nothing that imports it back, so whatever
// order the bundler settles on, this is standing before anything reads it.

import { stored } from '../storydoc/model';
import type { Cell } from '../storydoc/model';

/**
 * The cell the server is writing, and how far through the story it has read.
 *
 * The host says when it starts, how far it has got, and when it stops. Nothing
 * here starts it or times it out — a view that decided for itself when a job was
 * over would show a cell as finished while the model was still writing it.
 *
 * `at` is the exception to the host owning this: the job runs for minutes while
 * the document around it stays the author's, so a cell added or taken out above
 * this one moves it, and the index is found again from every document that
 * arrives rather than waiting for the host's next word about it. See
 * `followWriting` in view.ts.
 */
export interface Writing {
	at: number;
	written: number;
	chapters: number;
}

/**
 * A pass over the whole document, and how far through the chapters it is.
 *
 * Unlike `Writing`, which belongs to one cell, this belongs to the document —
 * every section of it is in the model's hands until it finishes, so nothing on
 * the page is the author's to change while it runs.
 */
export interface Styling {
	written: number;
	chapters: number;
	/**
	 * What the pass is doing while no chapter is landing.
	 *
	 * A chapter is one request, so the bar only moves when one finishes — and
	 * when the model is rate limited that can be minutes apart. Without
	 * something said in between, a pass that is waiting and a pass that has
	 * died look exactly alike.
	 */
	note?: string | null;
}

/** The box open for typing, and which cell it belongs to. */
export interface OpenBox {
	input: HTMLTextAreaElement;
	layer: HTMLElement;
	index: number;
}

export const state: {
	cells: Cell[];
	base: string;
	editing: number | null;
	selected: number;
	writing: Writing | null;
	styling: Styling | null;
	wanting: Set<string>;
	minimized: Set<string>;
	drawn: string;
	generation: number;
	openBox: OpenBox | null;
	typingTimer: ReturnType<typeof setTimeout> | undefined;
} = {
	cells: [],
	/** Where images in a cell resolve from; the host rewrites the folder for us. */
	base: '',
	/** The cell the caret is in, or null when none is open for editing. */
	editing: null,
	/** The cell the title-bar commands act on. */
	selected: 0,
	writing: null,
	/**
	 * The pass correcting the whole manuscript, while there is one.
	 *
	 * The host says when it starts, how far it has got and when it stops, exactly
	 * as it does for a cell being written. What it means here is that the surface
	 * is locked: the sections are being replaced under the author, and anything
	 * they typed would land either under what arrives or over it.
	 */
	styling: null,
	/**
	 * The sections the book still wants, by kind.
	 *
	 * Decided by the exporter and arriving with the answer to an export — nothing
	 * on this side has an opinion about what a book needs. By kind rather than by
	 * index, because the author goes on adding, moving and deleting cells around
	 * these and an index would name the wrong section by the time it was drawn.
	 */
	wanting: new Set<string>(),
	/**
	 * The sections folded away to their heading, by kind.
	 *
	 * The host holds this between sittings — it is about how the author likes to
	 * look at their manuscript, not about the manuscript, so it is kept beside the
	 * document rather than in it. By kind for the same reason the marks are: an
	 * index names a different section as soon as one is added above it.
	 */
	minimized: new Set<string>(),
	/**
	 * What is on the page right now.
	 *
	 * The document comes back after every edit, and this is how the view tells an
	 * echo it has already drawn from news it has not: a revert, a correction the
	 * server wrote, an edit in a text editor alongside. Only the cell being typed
	 * in is ahead of the document — the box on screen already says what was
	 * typed — so only typing records what it sent. Everything else waits to be
	 * told and draws what arrives.
	 */
	drawn: '',
	/**
	 * Bumped whenever the document changes underneath an open cell.
	 *
	 * The textarea's own handlers are still attached to a cell that no longer says
	 * what it said, and letting their blur write back would put the author's
	 * abandoned text over whatever arrived.
	 */
	generation: 0,
	/**
	 * The box open for typing, so its marks can be redrawn without the page being
	 * rebuilt around it.
	 */
	openBox: null,
	typingTimer: undefined,
};

/**
 * What a list of cells amounts to, for telling our own edit from someone else's.
 *
 * Compared as the document will read it back rather than as it was typed. A cell
 * goes to the file and is parsed out of it again, and the parse takes the blank
 * lines off either end — so pressing Enter at the foot of a cell, or leaving a
 * space at the end of a word and saving, sends something the document does not
 * hand back verbatim. Compared raw, that echo read as news from somewhere else,
 * and the page was rebuilt under the author mid-sentence.
 */
export function signatureOf(list: Cell[]): string {
	return JSON.stringify(
		list.map((cell) => ({ ...cell, source: stored(cell.source) }))
	);
}
