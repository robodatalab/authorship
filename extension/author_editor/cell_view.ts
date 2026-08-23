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
	isNamed,
	isStale,
	labelOf,
	renderMarkdown,
	runCell,
} from './model';
import { marked } from './find';
import { iconButton, insertButton, withBase } from './dom';
import { markedProse } from './marks';
import { fencedFor, wireMarks } from './marks_view';
import { beginEditing, sourceFor } from './editor_box';
import { commit, deleteCell, insertCell, moveCell } from './edits';
import { current, found, foundIn } from './find_bar';
import { hideSeam, seamFor, showSeam } from './seam_view';
import { openCellMenu, openInsertMenu } from './menu_view';
import { post } from './elements';
import { select } from './page_view';
import { state } from './state';
import type { CellField } from './model';
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
	row.addEventListener('mousedown', () => select(index));
	row.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		select(index);
		openCellMenu(event.clientX, event.clientY, index);
	});

	row.append(runColumnFor(cell, index), bodyFor(cell, index), actionsFor(index));
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
	run.dataset.tip = running
		? `Stop writing this ${named}`
		: built
			? `Build this ${named} from the document`
			: `Write this ${named} from the story`;
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

function bodyFor(cell: Cell, index: number): HTMLElement {
	const body = document.createElement('div');
	body.className = 'body';

	// A section the reader meets by name says its name, even when the author has
	// no say in what that name is.
	if (isNamed(cell.kind)) {
		const name = document.createElement('div');
		name.className = 'cell-name';
		name.textContent = labelOf(cell.kind);
		body.append(name);
	}

	const fields = fieldsOf(cell.kind);
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
	body.append(kindLabelFor(cell));
	return body;
}

/**
 * The facts a cell records, as fields rather than prose.
 *
 * A field called `title` is the cell's name and is shown as a heading — it is
 * what the author looks for when scrolling. The rest are a labelled list,
 * because a bare row of boxes says nothing about which is the publisher and
 * which is the date. A cell with no title, like the author's links, is all list.
 */
function fieldsFor(cell: Cell, index: number, fields: CellField[]): HTMLElement {
	const holder = document.createElement('div');
	holder.className = 'cell-fields';

	for (const field of fields) {
		const heading = field.name === 'title';
		const input = document.createElement('input');
		input.className = heading ? 'cell-title' : 'cell-field';
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
			// An empty field is one the author has not filled in, not one they
			// have filled in with nothing — so it leaves no attribute behind.
			if (!input.value) {
				delete attrs[field.name];
			}
			next[index] = { ...cell, attrs };
			commit(next);
		});

		if (heading) {
			holder.append(input);
			continue;
		}
		const row = document.createElement('label');
		row.className = 'cell-field-row';
		const label = document.createElement('span');
		label.className = 'cell-field-label';
		label.textContent = field.label;
		row.append(label, input);
		holder.append(row);
	}
	return holder;
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
			? 'Being written from the story…'
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

/** What the cell is, in its bottom corner, the way a notebook names its language. */
function kindLabelFor(cell: Cell): HTMLElement {
	const label = document.createElement('span');
	label.className = 'cell-kind';
	label.textContent = labelOf(cell.kind);
	if (isAutomated(cell.kind)) {
		label.classList.add('automated');
	}
	return label;
}

/** The actions that float at the cell's top-right corner. */
function actionsFor(index: number): HTMLElement {
	const actions = document.createElement('div');
	actions.className = 'actions';
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
