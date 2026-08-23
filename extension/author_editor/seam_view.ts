// The seam, where a section is cut in two or joined to the one above.
//
// A line that follows the pointer down the cell and offers, at whichever gap
// between paragraphs it is nearest, to divide the section there. It hangs over
// the cell rather than standing in it, so following the pointer moves nothing
// the author is reading.
//
// Where the line currently is, is state — because a mousemove arrives far more
// often than the answer to it changes, and rebuilding the seam on every one of
// them is a rebuild the author can see.

import { divisionsOf, mergeAt, mergesUp, splitAt } from './model';
import { commit } from './edits';
import { followEditing } from './editor_box';
import { state } from './state';

/** Somewhere a section can be divided, and where that place is on screen. */
interface Seam {
	/** How far down the cell the line is drawn. */
	y: number;
	/** The source line a cut would fall on; 0 for the seam above the section. */
	line: number;
	/** The seam above a section joins it to the one before rather than cutting it. */
	merge: boolean;
}

/** The seam the line is drawn at, and the section it was drawn on. */
let seamAt: (Seam & { index: number }) | null = null;

/** Forget where the line was, because the page it was drawn on has been redrawn. */
export function forgetSeam(): void {
	seamAt = null;
}

/**
 * The line that offers to divide a section, hidden until the pointer says where.
 *
 * One per section that can be divided; a section that is one thing has none at
 * all.
 */
export function seamFor(index: number): HTMLElement {
	const seam = document.createElement('div');
	seam.className = 'seam';
	seam.hidden = true;

	const line = document.createElement('div');
	line.className = 'seam-line';

	const menu = document.createElement('div');
	menu.className = 'seam-menu';
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'seam-action';
	button.append(document.createElement('i'));
	button.addEventListener('click', (event) => {
		event.stopPropagation();
		if (seamAt === null || seamAt.index !== index) {
			return;
		}
		if (seamAt.merge) {
			state.selected = index - 1;
			// This cell is now the tail of the one above it, and so is the box.
			followEditing((open) => (open >= index ? open - 1 : open));
			commit(mergeAt(state.cells, index));
		} else {
			state.selected = index + 1;
			// The box stays on the head of the split, which is where the caret was.
			followEditing((open) => (open > index ? open + 1 : open));
			commit(splitAt(state.cells, index, seamAt.line));
		}
	});
	menu.append(button);

	seam.append(line, menu);
	return seam;
}

/**
 * Draw the line at whichever seam the pointer is nearest.
 *
 * Nothing is rebuilt while the pointer is still between the same two paragraphs:
 * a mousemove arrives far more often than the answer to it changes.
 */
export function showSeam(row: HTMLElement, index: number, pointer: number): void {
	const seam = row.querySelector('.seam') as HTMLElement | null;
	if (!seam) {
		return;
	}
	const y = pointer - row.getBoundingClientRect().top;
	const nearest = seamsOf(row, index).reduce<Seam | null>(
		(best, one) =>
			best === null || Math.abs(one.y - y) < Math.abs(best.y - y) ? one : best,
		null
	);
	if (nearest === null) {
		hideSeam(row, index);
		return;
	}
	if (
		seamAt !== null &&
		seamAt.index === index &&
		seamAt.line === nearest.line &&
		seamAt.merge === nearest.merge
	) {
		return;
	}
	seamAt = { ...nearest, index };
	seam.hidden = false;
	seam.style.top = `${nearest.y}px`;
	const button = seam.querySelector('.seam-action') as HTMLElement;
	button.dataset.tip = nearest.merge
		? 'Join this section to the one above it'
		: 'Split the section here';
	(button.firstElementChild as HTMLElement).className = nearest.merge
		? 'codicon codicon-merge'
		: 'codicon codicon-split-vertical';
}

export function hideSeam(row: HTMLElement, index: number): void {
	const seam = row.querySelector('.seam') as HTMLElement | null;
	if (seam) {
		seam.hidden = true;
	}
	if (seamAt?.index === index) {
		seamAt = null;
	}
}

/**
 * Where this section can be divided, and how far down the cell each place is.
 *
 * The seam above a section is not a cut — nothing would be above it — it is
 * where the section joins the one before, when that one is the same kind. Which
 * is why the top of a section is never offered as somewhere to split it.
 *
 * A section open for typing has none: what is on screen is the text itself, and
 * the author is already free to cut it with the return key.
 */
function seamsOf(row: HTMLElement, index: number): Seam[] {
	const cell = state.cells[index];
	if (!cell || state.editing === index || state.writing?.at === index) {
		return [];
	}
	const seams: Seam[] = [];
	if (mergesUp(state.cells, index)) {
		seams.push({ y: 0, line: 0, merge: true });
	}
	const rendered = row.querySelector('.rendered');
	if (!rendered) {
		return seams;
	}
	const top = row.getBoundingClientRect().top;
	divisionsOf(cell.source).forEach((line, block) => {
		const shown = rendered.children[block + 1];
		if (shown) {
			seams.push({ y: shown.getBoundingClientRect().top - top, line, merge: false });
		}
	});
	return seams;
}
