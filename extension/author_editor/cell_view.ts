// What one cell is made of.
//
// There is no renderer per kind of cell, and that is deliberate: a chapter, a
// blurb, a table of contents and a cover are drawn by this one function, and
// what makes them look different is what model.ts says about them — whether the
// kind is named, what fields it records, whether it holds prose, whether it is
// built rather than written. Adding a kind is adding an entry to KINDS, not a
// file here. A `chapter_cell.ts` beside a `blurb_cell.ts` would be two copies of
// this waiting to drift apart.
//
// Laid out the way a notebook lays a cell out: a run column down the left, the
// body filling the width beside it, its actions floating at the top right, and
// what the cell is named quietly in its bottom corner.

import {
	KINDS,
	fieldsOf,
	hasProse,
	isAutomated,
	isDivisible,
	isGenerated,
	isHeading,
	isNamed,
	isStale,
	isFolded,
	labelOf,
	saidWords,
	renderMarkdown,
	runCell,
	writesOf,
	writtenFrom,
} from './model';
import { marked } from './find';
import { iconButton, insertButton, withBase } from './dom';
import { markedProse } from './marks';
import { fencedFor, wireMarks } from './marks_view';
import { beginEditing, sourceFor } from './editor_box';
import { commit, deleteCell, foldCell, insertCell, moveCell } from './edits';
import { current, found, foundIn } from './find_bar';
import { hideSeam, seamFor, showSeam } from './seam_view';
import { openCellMenu, openInsertMenu } from './menu_view';
import { post } from './elements';
import { select, wordsHeaded } from './page_view';
import { state } from './state';
import type { CellField } from './model';
import { NO } from '../storydoc/model';
import type { Cell } from '../storydoc/model';
import type { Writing } from './state';

export function cellElement(cell: Cell, index: number): HTMLElement {
	const row = document.createElement('section');
	row.className = 'cell';
	// The kind is the cell's identity, so the stylesheet is told it rather than
	// being told a class per kind that means the same thing.
	row.dataset.kind = cell.kind;
	if (index === state.selected) {
		row.classList.add('selected');
	}
	if (state.editing === index) {
		row.classList.add('editing');
	}
	if (state.writing?.at === index) {
		row.classList.add('writing');
	}
	// A section the book needs that has nothing in it yet, as the exporter last
	// answered. Marked by kind, so it stays on the right section however the
	// document is rearranged around it.
	if (state.wanting.has(cell.kind)) {
		row.classList.add('wanting');
	}
	if (isFolded(cell)) {
		row.classList.add('folded');
	}
	row.addEventListener('mousedown', () => select(index));
	row.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		select(index);
		openCellMenu(event.clientX, event.clientY, index);
	});

	row.append(runColumnFor(cell, index), panelFor(cell, index));
	if (isDivisible(cell.kind)) {
		row.append(seamFor(index));
		row.addEventListener('mousemove', (event) => showSeam(row, index, event.clientY));
		row.addEventListener('mouseleave', () => hideSeam(row, index));
	}
	return row;
}

/**
 * The narrow column down the left: the run button for a cell that is run, and
 * under it whether what it holds is still what it would build to.
 *
 * Two kinds of cell have a run button and they run differently. A built one — a
 * table of contents — is made here from the cells around it, in an instant. A
 * generated one is written by the server from the whole story, and takes as long
 * as that takes, so the host runs it and shows the progress.
 *
 * Reserved even for a cell nobody runs, so the bodies line up down the page.
 */
function runColumnFor(cell: Cell, index: number): HTMLElement {
	const column = document.createElement('div');
	column.className = 'run-column';

	const built = isAutomated(cell.kind);
	const generated = isGenerated(cell.kind);
	if (!built && !generated) {
		return column;
	}

	const named = labelOf(cell.kind).toLowerCase();
	// A cell being written is stopped by the same button that started it, as a
	// notebook stops a running cell: the button says what the cell is doing, and
	// pressing it asks for the other thing.
	const running = state.writing?.at === index;
	const run = document.createElement('button');
	run.type = 'button';
	run.className = running ? 'run running' : 'run';
	// A built section is spoken of by its label; a written one has words of its
	// own, because "Stop writing this the story so far" is what a label makes of
	// a name that is already a sentence.
	run.dataset.tip = running
		? `Stop writing ${writesOf(cell.kind)}`
		: built
			? `Build this ${named} from the document`
			: `Write ${writesOf(cell.kind)} from ${writtenFrom(cell.kind)}`;
	const glyph = document.createElement('i');
	glyph.className = running
		? 'codicon codicon-primitive-square'
		: 'codicon codicon-play';
	run.append(glyph);
	run.addEventListener('click', (event) => {
		event.stopPropagation();
		if (running) {
			post({ type: 'stop', at: index });
		} else if (built) {
			commit(runCell(state.cells, index));
		} else {
			post({ type: 'generate', at: index });
		}
	});
	column.append(run);

	// Only a cell built from the document can be out of step with it. What a model
	// wrote has nothing to disagree with, and a draft the author has since edited
	// is not out of date — it is theirs.
	if (built) {
		const stale = isStale(state.cells, index);
		const shown = document.createElement('i');
		shown.className = stale
			? 'state stale codicon codicon-circle-large-outline'
			: 'state fresh codicon codicon-pass-filled';
		shown.dataset.tip = stale
			? 'Out of date — the document has moved on since this was built'
			: 'Up to date with the document';
		column.append(shown);
	}
	return column;
}

/**
 * One section, as a panel: a header, a body, a footer.
 *
 * The same three parts in the same three places on every kind of section, each
 * with one job. The header says what the section is, what it is called, and what
 * can be done to it. The body is what the author put in it — the fields, the
 * picture, the prose. The footer is what the section comes to, which today is
 * what it weighs.
 *
 * Every one of them stands in the flow, and that is the point of the
 * arrangement: nothing is drawn in a corner over something else. A name in a
 * corner sat on the writing, a menu floating over the top edge sat on the name,
 * and a count added to the body landed on the name in the corner. Three parts
 * with room of their own cannot land on each other.
 *
 * A part with nothing to put in it is not drawn: a section with no fields and no
 * prose has no body, and only the two levels of the story have anything to
 * total. The header is the one part every section has.
 */
function panelFor(cell: Cell, index: number): HTMLElement {
	const panel = document.createElement('div');
	panel.className = 'panel';
	panel.append(headFor(cell, index));

	const body = bodyFor(cell, index);
	if (body) {
		panel.append(body);
	}
	const foot = footFor(cell, index);
	if (foot) {
		panel.append(foot);
	}
	return panel;
}

/**
 * What the section is called, what it is, and what can be done to it.
 *
 * The same header whatever the section is doing. It is the one part of a panel
 * that never changes: folding a section takes away what is under the header, not
 * what is in it, so a document folded and unfolded reads down the same left edge
 * both times. Nothing is ever lifted into it from below — a header that borrowed
 * the first line of the writing would be a different header on every section and
 * a moving target on each one.
 *
 * The name takes the left, where the writing under it starts, so a title lines
 * up with the prose it heads however long the words beside it are. It is the box
 * a title is typed into, or the section's own name where the author has no say
 * in it, and nothing at all in a section that has neither.
 *
 * The kind and the buttons take the right, as chrome should: the kind was
 * already whispered in the corner and has only come up into the row, and the
 * buttons keep their room whether they are showing or not, so the header does
 * not change shape under the pointer.
 *
 * A section the reader meets by name says that name once. The kind *is* the
 * name — "About the Author" is what that page is called — so it is said in the
 * name's place, in the document's own hand, and not again as chrome.
 */
function headFor(cell: Cell, index: number): HTMLElement {
	const head = document.createElement('header');
	head.className = 'cell-head';
	const named = isNamed(cell.kind);
	const title = fieldsOf(cell.kind).find((field) => field.name === TITLE);

	if (named) {
		const name = document.createElement('div');
		name.className = 'cell-name';
		name.textContent = labelOf(cell.kind);
		head.append(name);
	} else if (title) {
		head.append(boxFor(cell, index, title));
	}
	if (!named) {
		head.append(kindLabelFor(cell));
	}
	head.append(actionsFor(cell, index));
	return head;
}

/**
 * What the author put in the section, or null where there is nothing in it.
 *
 * The name is not here — it is the header's — so what is left is everything
 * else: the facts the kind records, the bar for a cell being written, and the
 * prose or the picture.
 *
 * A folded section has no body at all. That is the whole of what folding does,
 * and the whole of what it is allowed to do: everything a section shows about
 * itself is under the header, so taking it away is one thing to think about
 * rather than a rule per kind of section.
 */
function bodyFor(cell: Cell, index: number): HTMLElement | null {
	if (isFolded(cell)) {
		return null;
	}
	const body = document.createElement('div');
	body.className = 'cell-body';

	const fields = fieldsOf(cell.kind).filter((field) => field.name !== TITLE);
	if (fields.length > 0) {
		body.append(fieldsFor(cell, index, fields));
	}

	// Above what is being replaced, because that is where the author is looking
	// while they wait for it — not at a notification behind the editor.
	if (state.writing?.at === index) {
		body.append(writingBarFor(state.writing));
	}

	// A chapter is its title and nothing else — there is no prose in it to show,
	// and the writing beneath it is markdown cells of its own.
	if (hasProse(cell.kind)) {
		body.append(
			state.editing === index ? sourceFor(cell, index) : renderedFor(cell, index)
		);
	}
	return body.childElementCount > 0 ? body : null;
}

/**
 * What the section comes to, or null where it comes to nothing.
 *
 * Only the two levels of the story have anything to total: a chapter weighs what
 * is written under it and a part weighs its chapters. Folded away with the body,
 * because a fold takes away everything under the header — what a section adds up
 * to is about what is in it, and what is in it is what has just been put away.
 */
function footFor(cell: Cell, index: number): HTMLElement | null {
	if (isFolded(cell) || !isHeading(cell.kind)) {
		return null;
	}
	const foot = document.createElement('footer');
	foot.className = 'cell-foot';
	foot.append(wordsFor(index));
	return foot;
}

/** The field a section is named by, which its header carries rather than its
 *  body. */
const TITLE = 'title';

/**
 * The facts a cell records, as fields rather than prose.
 *
 * A labelled list, because a bare row of boxes says nothing about which is the
 * publisher and which is the date. Every field is written on the same row
 * whatever it holds — the name in the label column, the control beside it — so
 * a section with three of them reads as one list and not as three arrangements.
 */
function fieldsFor(cell: Cell, index: number, fields: CellField[]): HTMLElement {
	const holder = document.createElement('div');
	holder.className = 'cell-fields';

	for (const field of fields) {
		if (field.toggle) {
			holder.append(toggleFor(cell, index, field));
			continue;
		}
		const row = document.createElement('label');
		row.className = 'cell-field-row';
		const label = document.createElement('span');
		label.className = 'cell-field-label';
		label.textContent = field.label;
		row.append(label, boxFor(cell, index, field));
		holder.append(row);
	}
	return holder;
}

/**
 * One field as the box it is typed into.
 *
 * The same box wherever it is drawn — the title in the header is the field the
 * author edits, not a copy of it kept somewhere else — so what a box does when
 * it is typed in, and what it looks like when the find bar has a match in it, is
 * written down once.
 */
function boxFor(cell: Cell, index: number, field: CellField): HTMLInputElement {
	const input = document.createElement('input');
	input.className = field.name === TITLE ? 'cell-title' : 'cell-field';
	input.value = cell.attrs[field.name] ?? '';
	// The label is already beside the box, so an empty box is free to say what
	// a good value looks like instead of repeating the name.
	input.placeholder =
		field.hint ?? (field.optional ? `${field.label} (optional)` : field.label);
	// A box cannot hold a mark around part of what it says, so a field with a
	// match in it is lit whole.
	const hits = foundIn(index, field.name);
	if (hits.length > 0) {
		input.classList.add('find-field');
		const here = found[current];
		if (here && hits.includes(here)) {
			input.classList.add('current');
		}
	}
	input.addEventListener('change', () => {
		const next = [...state.cells];
		const attrs = { ...cell.attrs, [field.name]: input.value };
		// An empty field is one the author has not filled in, not one they have
		// filled in with nothing — so it leaves no attribute behind.
		if (!input.value) {
			delete attrs[field.name];
		}
		next[index] = { ...cell, attrs };
		commit(next);
	});
	return input;
}

/**
 * A fact with two answers, as the box the author ticks.
 *
 * The same row every other field is written on — the name in the label column,
 * the control beside it — because it is another fact about the section and not
 * another kind of thing. What a tick means is the hint, which a box has nowhere
 * to print the way an empty text field does, so it is said on hovering the row.
 *
 * Unticking is what writes the attribute: the answer every cell already in the
 * document gives is the ticked one, so a part written before the box existed is
 * still a part that prints.
 */
function toggleFor(cell: Cell, index: number, field: CellField): HTMLElement {
	const row = document.createElement('label');
	row.className = 'cell-field-row';
	if (field.hint) {
		row.title = field.hint;
	}
	const said = document.createElement('span');
	said.className = 'cell-field-label';
	said.textContent = field.label;

	const box = document.createElement('input');
	box.type = 'checkbox';
	box.className = 'cell-toggle';
	box.checked = cell.attrs[field.name] !== NO;

	box.addEventListener('change', () => {
		const attrs = { ...cell.attrs };
		if (box.checked) {
			delete attrs[field.name];
		} else {
			attrs[field.name] = NO;
		}
		const next = [...state.cells];
		next[index] = { ...cell, attrs };
		commit(next);
	});
	row.append(said, box);
	return row;
}

/**
 * What the writing under a heading weighs, said under the heading.
 *
 * The same count as the toolbar's, made of the same words and standing at the
 * same end of the line, so a chapter's number and the document's are two
 * readings of one thing and are read in the same place. Kept out of the corner
 * where the kind is whispered: this is the author's own measure of the day's
 * work and is there to be read, not to be hunted for on hover.
 */
function wordsFor(index: number): HTMLElement {
	const said = document.createElement('div');
	said.className = 'cell-words';
	said.textContent = saidWords(wordsHeaded(index));
	return said;
}

/** A cell as the reader will meet it: the markdown, rendered. */
function renderedFor(cell: Cell, index: number): HTMLElement {
	const rendered = document.createElement('div');
	rendered.className = 'rendered';
	if (cell.source) {
		rendered.innerHTML = withBase(
			markedProse(marked(renderMarkdown(fencedFor(cell, index)))),
			state.base
		);
		wireMarks(rendered);
	} else {
		rendered.classList.add('blank');
		rendered.textContent = state.writing?.at === index
			? `Being written from ${writtenFrom(cell.kind)}…`
			: isAutomated(cell.kind)
				? 'Empty — run this section to build it.'
				: 'Empty — double-click to write.';
	}
	// Clicking selects; opening a cell is a double-click, as it is in a notebook.
	// One gesture that sometimes opened a cell and sometimes did not was the
	// whole trouble — where in the cell you happened to land decided it.
	rendered.addEventListener('dblclick', () => beginEditing(index));
	return rendered;
}

/**
 * How far the server has got with the cell it is writing.
 *
 * The story is read a chapter at a time, so the bar is chapters — the one
 * division the work actually has. Until the document has been read there is no
 * fraction to draw, and an empty track says waiting rather than none of none.
 */
function writingBarFor(progress: Writing): HTMLElement {
	const holder = document.createElement('div');
	holder.className = 'writing';

	const track = document.createElement('div');
	track.className = 'writing-track';
	const fill = document.createElement('div');
	fill.className = 'writing-fill';
	fill.style.width = progress.chapters
		? `${(100 * progress.written) / progress.chapters}%`
		: '0%';
	track.append(fill);

	const said = document.createElement('span');
	said.className = 'writing-said';
	// The bar is what is finished; the words are what is being worked on, which
	// is the chapter after the last one done — until there is none after it.
	said.textContent = progress.chapters
		? `Writing — chapter ${Math.min(progress.written + 1, progress.chapters)} of ${progress.chapters}`
		: 'Writing…';

	holder.append(track, said);
	return holder;
}

/** What the cell is, at the head of it, the way a notebook names its language. */
function kindLabelFor(cell: Cell): HTMLElement {
	const label = document.createElement('span');
	label.className = 'cell-kind';
	label.textContent = labelOf(cell.kind);
	if (isAutomated(cell.kind)) {
		label.classList.add('automated');
	}
	return label;
}

/** What can be done to the section, at the right end of its header. */
function actionsFor(cell: Cell, index: number): HTMLElement {
	const actions = document.createElement('div');
	actions.className = 'actions';
	const folded = isFolded(cell);
	actions.append(
		iconButton(
			folded ? 'fold-down' : 'fold-up',
			folded ? 'Unfold this section' : 'Fold this section away',
			() => foldCell(index, !folded)
		)
	);
	actions.append(
		iconButton('chevron-up', 'Move up', () => moveCell(index, -1)),
		iconButton('chevron-down', 'Move down', () => moveCell(index, 1)),
		iconButton('trash', 'Delete this section', () => deleteCell(index))
	);
	return actions;
}


/**
 * The strip in a gap between cells, where a cell is added at `at`.
 *
 * Insertion belongs here rather than in the toolbar: what an author means by
 * "add a chapter" is nearly always "add one *here*", and a toolbar button has to
 * be told where here is. The bar is where the cursor already was.
 */
export function insertBarFor(at: number): HTMLElement {
	const bar = document.createElement('div');
	bar.className = 'insert-bar';

	for (const kind of KINDS.filter((k) => k.primary)) {
		bar.append(insertButton(kind.label, () => insertCell(at, kind.blank())));
	}
	bar.append(
		insertButton(
			'',
			(event) => {
				const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
				openInsertMenu(box.left, box.bottom + 2, at);
			},
			'ellipsis',
			'Add any kind of section here'
		)
	);
	return bar;
}
