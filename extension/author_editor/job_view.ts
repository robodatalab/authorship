// The bar under the toolbar, for the work that is being done to the whole
// document rather than to one cell of it.
//
// A cell being written draws its own bar, in the cell, above what is about to be
// replaced — which is where the author is looking. A pass over the manuscript
// has no such place: every section of it is going to be replaced in turn, so the
// bar belongs where the document's own state is shown, and it stays on screen
// while the author scrolls through what is being corrected.
//
// The other half of what this module does is take the page away. While the pass
// runs, the sections on screen are the model's and not the author's: anything
// typed into one lands either under the correction that is coming or over it.
// So the surface is locked, and the one thing left that can be clicked is stop.

import { jobEl, jobFillEl, jobSaidEl, jobStopEl, post } from './elements';
import { closeEditing } from './editor_box';
import { redrawCell } from './page_view';
import { state } from './state';
import type { Styling } from './state';

jobStopEl.addEventListener('click', () => post({ type: 'stop' }));

/**
 * The host has started, moved on with, or finished a pass over the document.
 *
 * `null` is the end of it, however it ended — finished, stopped, or failed. The
 * page never decides that for itself: a bar that timed itself out would unlock
 * the document while the model was still writing into it.
 */
export function setStyling(styling: Styling | null): void {
	state.styling = styling;
	// A cell open for typing when the pass starts is taken away from the author,
	// box and all. Leaving it open would be inviting them to write something the
	// correction is about to land on top of — and the cell is drawn again, since
	// closing it only says the box is gone and does not take it off the page.
	const was = state.editing;
	if (styling !== null && was !== null) {
		closeEditing();
		redrawCell(was);
	}
	drawJob();
}

/** Draw the bar from whatever the host last said, and lock the page to match. */
export function drawJob(): void {
	const styling = state.styling;
	jobEl.hidden = styling === null;
	document.body.classList.toggle('locked', styling !== null);
	if (!styling) {
		return;
	}
	// Until the document has been read there is no fraction to draw, and an empty
	// track says waiting rather than none of none.
	jobFillEl.style.width = styling.chapters
		? `${(100 * styling.written) / styling.chapters}%`
		: '0%';
	// The bar is what is finished; the words are what is being worked on, which
	// is the chapter after the last one done — until there is none after it.
	jobSaidEl.textContent = styling.chapters
		? `Fixing style and grammar — chapter ${Math.min(styling.written + 1, styling.chapters)} of ${styling.chapters}`
		: 'Fixing style and grammar…';
}
