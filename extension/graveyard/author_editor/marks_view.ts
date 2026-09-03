// What the checks found, on the page.
//
// marks.ts converts between the coordinates the server works in and the ones the
// page does, and keeps a mark alive as the text under it moves; this draws the
// result, says what it means when the author stops on it, and offers the fix.
//
// The marks are not in the document, because a mark is what something thinks of
// the prose and not part of it — it is gone when the editor is, as an underline
// in a code file is. The host holds the same list, since this page can be
// rebuilt underneath the author at any moment.

import {
	blockAround,
	changeBetween,
	fencedMarks,
	markOf,
	marksOf,
	moved,
	placeInFile,
	placed,
	segmentsIn,
	withoutBlock,
} from './marks';
import { fenced, matchesIn } from './find';
import { sourceLinesOf } from './model';
import { checkEl, post, tipEl } from './elements';
import { commit } from './edits';
import { current, found, foundIn, query } from './find_bar';
import { redrawCell, render } from './page_view';
import { signatureOf, state } from './state';
import type { Cell } from '../storydoc/model';
import type { Finding, Mark } from './marks';

/**
 * How long what a mark says stays up once the pointer has left the word.
 *
 * Long enough to reach the box, because there is a button in it now. A tooltip
 * that vanishes on the way to the thing it is offering is a tooltip that offers
 * nothing.
 */
const TIP_GRACE_MS = 250;

/** What the checks have found, where the page draws rather than where the file says. */
let faults: Mark[] = [];
/** Whether this document is being checked at all. The host decides, and says. */
let checking = false;
/**
 * Where the last keystroke landed, which is the paragraph the author is in.
 *
 * A cell settles on a timer rather than on a key, so by the time the marks in
 * the paragraph have to be put out the keystroke that did it is gone.
 */
let changedAt = 0;
/**
 * The next number to give a mark.
 *
 * Findings arrive a report at a time, and a report numbers its own from
 * nothing — so the numbering is done here instead, where it can keep counting.
 */
let nextFault = 0;
/** The wait before what a mark says is taken off the page. */
let tipTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * The host has turned the checks on or off.
 *
 * Turned off, the marks go with it — the author has said they do not want to be
 * told, and prose left underlined would be telling them anyway.
 */
export function setChecking(on: boolean): void {
	checking = on;
	checkEl.classList.toggle('on', checking);
	if (!checking) {
		faults = [];
		hideTip();
		repaintMarks();
	}
}

/**
 * Take in what a check has just reported.
 *
 * A pass over the whole document replaces what the server said. A pass over one
 * paragraph only adds, since every other mark is about prose it never looked at.
 */
export function receiveFindings(findings: Finding[], whole: boolean): void {
	const arrived = placed(state.cells, findings, nextFault, 'server');
	nextFault += findings.length;
	faults = whole
		? [...faults.filter((mark) => mark.source !== 'server'), ...arrived]
		: [...faults, ...arrived];
	repaintMarks();
}

/**
 * Carry the marks over a keystroke, and remember where it landed.
 *
 * The marks over an open box are moved rather than waited for: the document is
 * told 400ms later, and an underline that lagged the text by that much would be
 * worse than none.
 */
export function markTyping(index: number, was: string, now: string): void {
	const change = changeBetween(was, now);
	changedAt = change.at + change.inserted;
	faults = moved(faults, index, change);
}

/**
 * A cell's text with both the marks over it and the matches in it fenced.
 *
 * Two fencings of one string, and each was measured on the string before either
 * went in — so the marks go first and the matches are found again in what comes
 * out. The fences are private-use characters no query can hold, so searching the
 * fenced text finds the same matches where they have moved to rather than any
 * others.
 */
export function fencedFor(cell: Cell, index: number): string {
	const withMarks = fencedMarks(cell.source, segmentsIn(faults, index));
	const here = foundIn(index, null);
	if (here.length === 0) {
		return withMarks;
	}
	const again = matchesIn([{ ...cell, source: withMarks }], query).filter(
		(match) => match.field === null
	);
	const at = here.indexOf(found[current]);
	return fenced(withMarks, again, at >= 0 ? (again[at] ?? null) : null);
}

/**
 * Give the marks in a rendered cell what they need to be stopped on.
 *
 * A run of text can be under more than one mark, and wears the colours of all of
 * them — the underlines are drawn on separate channels so that neither hides the
 * other, and stopping on the word says what each of them thinks.
 */
export function wireMarks(rendered: HTMLElement): void {
	rendered.querySelectorAll('.prose-mark').forEach((element) => {
		const shown = marksOf(faults, element.getAttribute('data-marks'));
		if (shown.length === 0) {
			return;
		}
		for (const mark of shown) {
			element.classList.add(`prose-mark-${mark.kind}`);
		}
		element.addEventListener('mouseenter', () =>
			showTip(shown, element as HTMLElement)
		);
		element.addEventListener('mouseleave', hideTip);
	});
}

/**
 * Draw the marks on the layer under the box, which holds the same text in the
 * same face.
 *
 * The same bargain the cursors strike, and for the same reason: a textarea can
 * no more underline a word than it can hold a second caret, so the text is laid
 * out again underneath and the lines are drawn on that.
 */
export function drawMarks(
	input: HTMLTextAreaElement,
	layer: HTMLElement,
	index: number
): void {
	layer.textContent = '';
	const text = input.value;
	const segments = segmentsIn(faults, index).filter(
		(segment) =>
			segment.at >= 0 && segment.end <= text.length && segment.end > segment.at
	);

	let read = 0;
	for (const segment of segments) {
		layer.append(document.createTextNode(text.slice(read, segment.at)));
		const shown = marksOf(faults, segment.ids.join(','));
		const line = document.createElement('span');
		line.className = [
			'prose-mark',
			...new Set(shown.map((mark) => `prose-mark-${mark.kind}`)),
		].join(' ');
		line.dataset.marks = segment.ids.join(',');
		line.textContent = text.slice(segment.at, segment.end);
		layer.append(line);
		read = segment.end;
	}
	layer.append(document.createTextNode(text.slice(read)));
}

/**
 * The mark the pointer is over, worked out from where the marks were drawn.
 *
 * The box is on top and takes every event, and the layer beneath it is not there
 * to be touched — so this asks the drawn spans where they are rather than asking
 * the pointer what it reached. `getClientRects` and not `getBoundingClientRect`,
 * because a mark that wrapped is two boxes and the gap between them is not part
 * of it.
 */
export function markAtPoint(
	layer: HTMLElement,
	x: number,
	y: number
): { marks: Mark[]; at: HTMLElement } | null {
	const drawn = layer.querySelectorAll('.prose-mark');
	for (let index = 0; index < drawn.length; index++) {
		const element = drawn[index] as HTMLElement;
		const boxes = element.getClientRects();
		for (let box = 0; box < boxes.length; box++) {
			const place = boxes[box];
			if (x >= place.left && x <= place.right && y >= place.top && y <= place.bottom) {
				const shown = marksOf(faults, element.getAttribute('data-marks'));
				return shown.length > 0 ? { marks: shown, at: element } : null;
			}
		}
	}
	return null;
}

/**
 * What the marks on a word say, where the author stopped on them.
 *
 * Three things about each and not one: what is wrong, which is what the
 * underline would say if it could speak; why, which is the whole reason a check
 * is worth having over a squiggle; and what to do about it, which is the only
 * part the author cannot work out for themselves.
 *
 * All of them, because a word can be under more than one mark and the author is
 * owed both readings rather than whichever happened to be found first.
 */
export function showTip(shown: Mark[], at: HTMLElement): void {
	if (shown.length === 0) {
		hideTip();
		return;
	}
	if (tipTimer !== undefined) {
		clearTimeout(tipTimer);
		tipTimer = undefined;
	}

	tipEl.textContent = '';
	for (const mark of shown) {
		const row = document.createElement('div');
		row.className = `mark-tip-row mark-tip-${mark.kind}`;

		const said = document.createElement('div');
		said.className = 'mark-tip-said';
		said.textContent = mark.message;

		const why = document.createElement('div');
		why.className = 'mark-tip-why';
		why.textContent = mark.detail;

		// The fault is what the fix is asked for by. Nothing here rewrites the
		// paragraph and hopes — the model is told which words and what is wrong with
		// them, and its answer is refused if the same rule still fires on it.
		const fix = document.createElement('button');
		fix.className = 'mark-tip-fix';
		fix.type = 'button';
		fix.textContent = 'Fix';
		fix.addEventListener('click', () => askFix(mark));

		row.append(said, why, fix);
		tipEl.append(row);
	}
	tipEl.hidden = false;

	// Laid out before it is placed, or its width is nothing and it is put wherever
	// nothing wide belongs.
	const box = at.getBoundingClientRect();
	const room = window.innerWidth - tipEl.offsetWidth - 8;
	tipEl.style.left = `${Math.max(8, Math.min(box.left, room))}px`;
	tipEl.style.top = `${box.bottom + 6}px`;
}

/** Take the box away, after long enough for the pointer to reach it. */
export function hideTip(): void {
	if (tipTimer !== undefined) {
		clearTimeout(tipTimer);
	}
	tipTimer = setTimeout(() => {
		tipEl.hidden = true;
		tipTimer = undefined;
	}, TIP_GRACE_MS);
}

/** Keep the box up while the pointer is in it — there is a button to reach. */
export function holdTip(): void {
	if (tipTimer !== undefined) {
		clearTimeout(tipTimer);
		tipTimer = undefined;
	}
}

/**
 * Ask for this fault to be put right, naming it rather than the paragraph it is
 * in.
 *
 * The mark is named by its id and not by where it is, because where it is will
 * have moved by the time the answer comes back — the author goes on typing while
 * the model reads.
 */
function askFix(mark: Mark): void {
	// Whatever found the fault sometimes knows what belongs there — a misspelling
	// has a spelling, a redundancy has a shorter form. There is nothing for a
	// model to work out, and nothing to wait for.
	if (mark.replacements.length > 0) {
		tipEl.hidden = true;
		applyFix(mark.id, mark.replacements[0]);
		return;
	}
	const at = placeInFile(state.cells, mark.cell, mark.at);
	const end = placeInFile(state.cells, mark.cell, mark.end);
	if (!at || !end) {
		return;
	}
	post({
		type: 'fixMark',
		id: mark.id,
		where: { at, end },
		rule: mark.rule,
		message: mark.message,
		detail: mark.detail,
	});
	tipEl.hidden = true;
}

/**
 * Put the fix in, where the mark is now.
 *
 * An edit like any other, and it goes in the same way the author's own would:
 * into the open box if the cell is being typed in, so that the keystroke path
 * moves the marks and settles the cell, and into the document otherwise. A mark
 * the author has meanwhile typed over is gone, and so is the fix for it.
 */
export function applyFix(id: number, replacement: string): void {
	const mark = markOf(faults, id);
	if (!mark) {
		return;
	}
	const cell = state.cells[mark.cell];
	if (!cell) {
		return;
	}

	if (state.openBox && state.openBox.index === mark.cell) {
		const input = state.openBox.input;
		input.value =
			input.value.slice(0, mark.at) + replacement + input.value.slice(mark.end);
		input.dispatchEvent(new Event('input'));
		return;
	}

	const source =
		cell.source.slice(0, mark.at) + replacement + cell.source.slice(mark.end);
	const next = [...state.cells];
	next[mark.cell] = { ...cell, source };
	faults = moved(faults, mark.cell, {
		at: mark.at,
		removed: mark.end - mark.at,
		inserted: replacement.length,
	});
	changedAt = mark.at + replacement.length;
	state.drawn = signatureOf(next);
	commit(next);
	recheckBlock(mark.cell, source);
	repaintMarks();
}

/**
 * Redraw what the marks are drawn on, and nothing else.
 *
 * The page is rebuilt when it can be, and every cell but the open one when it
 * cannot: rebuilding around a box being typed into takes the box with it.
 */
export function repaintMarks(): void {
	if (state.editing === null) {
		render();
		return;
	}
	state.cells.forEach((_, index) => {
		if (index !== state.editing) {
			redrawCell(index);
		}
	});
	if (state.openBox) {
		drawMarks(state.openBox.input, state.openBox.layer, state.openBox.index);
	}
}

/**
 * Put out what was said about the paragraph just written in, and ask about it
 * again.
 *
 * Only that paragraph. A mark anywhere else is about prose the author has not
 * touched and is still true, and taking the underlines off a document because
 * one word in it changed is the flicker this whole design exists to avoid. What
 * goes with it is whatever was paired with it — the far half of a repetition the
 * author has just answered by rewriting this half.
 */
export function recheckBlock(index: number, source: string): void {
	if (!checking) {
		return;
	}
	const block = blockAround(source, Math.min(changedAt, source.length));
	faults = withoutBlock(faults, index, block);
	if (state.openBox && state.openBox.index === index) {
		drawMarks(state.openBox.input, state.openBox.layer, index);
	}
	// The server works in the file's lines, and the paragraph is a run of lines
	// inside a cell that knows where it starts.
	const where = sourceLinesOf(state.cells, index);
	if (where) {
		post({
			type: 'checkBlock',
			where: { start: where.start + block.first, end: where.start + block.last },
		});
	}
}

// The box has a button in it, so the pointer has to be able to live there. It
// stays while it is under the pointer and goes when the pointer leaves it.
tipEl.addEventListener('mouseenter', holdTip);
tipEl.addEventListener('mouseleave', hideTip);
// Pressing something in the box must not take the caret out of the cell. A box
// that has lost the caret has been accepted and shut, so the author would be put
// back on the page by the very act of asking for the fix — and the fix would
// arrive at a cell that was no longer open. Refusing the focus is enough: the
// click still happens, and the caret never moves.
tipEl.addEventListener('mousedown', (event) => event.preventDefault());
