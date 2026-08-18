// The cell surface, running inside the webview. Everything here is DOM and the
// message channel; the document it edits lives host-side in author_editor/panel.ts.
//
// Laid out the way a notebook is laid out, because that is what it is: a run
// column down the left, the cell filling the width beside it, its actions
// floating at the top right of whichever cell has focus, and what the cell is
// named quietly in its bottom corner.
//
// The toolbar is in here, above the cells, the way a notebook's is. It was in
// the editor title bar for a while, where VS Code drew it — but that bar is
// shared with every other extension and with VS Code's own buttons, so what got
// shown was not ours to decide, and tools kept disappearing into an overflow.
//
// The host owns the truth. A cell being typed into is the one exception — it
// holds its own text until it settles, because a repaint mid-keystroke would
// take the caret with it. Everything else is drawn from what the host last sent.

import {
	KINDS,
	divisionsOf,
	insertAt,
	withDefaultCell,
	hasProse,
	isAutomated,
	isDivisible,
	isGenerated,
	isNamed,
	isStale,
	fieldsOf,
	labelOf,
	mergeAt,
	mergesUp,
	moveBy,
	placeOf,
	removeAt,
	renderMarkdown,
	runCell,
	sourceLinesOf,
	splitAt,
} from './model';
import {
	fenced,
	isUnderstood,
	marked,
	matchesIn,
	replaced,
	replacedAll,
} from './find';
import type { CellField } from './model';
import type { Match, Query } from './find';
import type { Cell } from '../storydoc/model';

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const cellsEl = document.getElementById('cells') as HTMLElement;
const menuEl = document.getElementById('menu') as HTMLElement;
const toolbarEl = document.getElementById('toolbar') as HTMLElement;
const statusEl = document.getElementById('doc-status') as HTMLElement;
const whereEl = document.getElementById('doc-where') as HTMLElement;
const findEl = document.getElementById('find') as HTMLElement;
const findBoxEl = document.getElementById('find-box') as HTMLElement;
const whatEl = document.getElementById('find-what') as HTMLInputElement;
const withEl = document.getElementById('find-with') as HTMLInputElement;
const countEl = document.getElementById('find-count') as HTMLElement;
const replaceRowEl = document.getElementById('find-replace-row') as HTMLElement;
const replaceToggleEl = document.getElementById('find-toggle') as HTMLElement;

/** How long after the last keystroke an open cell is written to the document. */
const TYPING_DEBOUNCE_MS = 400;

let cells: Cell[] = [];
/** Where images in a cell resolve from; the host rewrites the folder for us. */
let base = '';
/** The cell the caret is in, or null when none is open for editing. */
let editing: number | null = null;
/** The cell the title-bar commands act on. */
let selected = 0;
let typingTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * The cell the server is writing, and how far through the story it has read.
 *
 * The host says when it starts, how far it has got, and when it stops. Nothing
 * here starts it or times it out — a view that decided for itself when a job was
 * over would show a cell as finished while the model was still writing it.
 */
let writing: Writing | null = null;

interface Writing {
	at: number;
	written: number;
	chapters: number;
}

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

/**
 * What is on the page right now.
 *
 * The document comes back after every edit, and this is how the view tells an
 * echo it has already drawn from news it has not: a revert, a correction the
 * server wrote, an edit in a text editor alongside. Only the cell being typed in
 * is ahead of the document — the box on screen already says what was typed — so
 * only typing records what it sent. Everything else waits to be told and draws
 * what arrives.
 */
let drawn = '';

/**
 * Bumped whenever the document changes underneath an open cell.
 *
 * The textarea's own handlers are still attached to a cell that no longer says
 * what it said, and letting their blur write back would put the author's
 * abandoned text over whatever arrived.
 */
let generation = 0;

function signatureOf(list: Cell[]): string {
	return JSON.stringify(list);
}

function commit(next: Cell[]): void {
	cells = next;
	vscode.postMessage({ type: 'cells', cells });
	// What was found is found in the document, so it is asked again whenever the
	// document says something else. The marks themselves are left to whoever
	// redraws — a cell repainted here would be a cell repainted mid-keystroke.
	refind();
	showCount();
}

// --- the toolbar ---

for (const [id, type] of [
	['run-all', 'compile'],
	['import-markdown', 'importMarkdown'],
	['export-markdown', 'exportMarkdown'],
	['export-epub', 'exportEpub'],
	['export-parts', 'partition'],
	['as-text', 'openAsText'],
] as const) {
	document
		.getElementById(id)!
		.addEventListener('click', () => vscode.postMessage({ type }));
}

document.getElementById('spell')!.addEventListener('click', answerSpellCheck);

// Keep a click on the toolbar from also being the click that dismisses a menu.
toolbarEl.addEventListener('mousedown', (event) => event.stopPropagation());

/**
 * Which lines the host should have corrected, or null when there are none.
 *
 * Null is reported rather than swallowed: a selected chapter has no prose in it
 * and a button that quietly does nothing is indistinguishable from one that is
 * broken.
 */
function answerSpellCheck(): void {
	vscode.postMessage({ type: 'spellCheck', where: sourceLinesOf(cells, selected) });
}

// --- cells ---

/**
 * Redraw the whole page.
 *
 * Only for when the list of cells has actually changed shape — rebuilding the
 * DOM under a cursor that is mid-click loses the click, so a change to one cell
 * goes through `redrawCell` instead.
 */
function render(): void {
	const wasAt = window.scrollY;
	cellsEl.textContent = '';
	cells.forEach((cell, index) => {
		cellsEl.append(insertBarFor(index));
		cellsEl.append(cellElement(cell, index));
	});
	// The bar below the last cell. With one above every cell as well, every gap in
	// the document has one — including the gap above the first cell, which is the
	// only way a cover gets in front of a title page that is already written.
	cellsEl.append(insertBarFor(cells.length));
	statusEl.textContent = documentStatus();
	showWhere();
	drawn = signatureOf(cells);
	seamAt = null;
	noteMarks();
	// Rebuilding resets the scroll; the author was reading somewhere.
	window.scrollTo({ top: wasAt });
}

/** Redraw one cell in place, leaving every other element on the page alone. */
function redrawCell(index: number): void {
	const existing = cellsEl.querySelectorAll('.cell')[index];
	if (!existing) {
		render();
		return;
	}
	existing.replaceWith(cellElement(cells[index], index));
	statusEl.textContent = documentStatus();
	showWhere();
	drawn = signatureOf(cells);
	seamAt = null;
}

/**
 * Say at the top of the page which part and chapter is being read.
 *
 * Taken from what is on screen rather than from what is selected: an author
 * scrolling through a hundred thousand words has not clicked on anything, and
 * telling them where they have got to is the whole job of the line.
 *
 * A story with no parts is only ever in a chapter, and says so. Before the first
 * chapter there is nowhere to be, and the line stands empty rather than naming
 * the front matter — the toolbar already has enough to say.
 */
function showWhere(): void {
	const place = placeOf(cells, cellAtTop());
	whereEl.textContent =
		place.chapter === null
			? ''
			: place.part === null
				? place.chapter
				: `${place.part} \u00b7 ${place.chapter}`;
}

/**
 * The cell the toolbar is sitting on: the last one whose top has gone under it.
 *
 * The toolbar covers the page rather than pushing it down, so what counts as the
 * top of the view is the underside of the toolbar — a chapter measured against
 * the window's top would still be named for a moment after it had scrolled out
 * of sight behind it.
 */
function cellAtTop(): number {
	const line = toolbarEl.getBoundingClientRect().bottom;
	let at = 0;
	cellsEl.querySelectorAll('.cell').forEach((row, index) => {
		if (row.getBoundingClientRect().top <= line) {
			at = index;
		}
	});
	return at;
}

function documentStatus(): string {
	const chapters = cells.filter((cell) => cell.kind === 'chapter').length;
	const stale = cells.filter((_cell, index) => isStale(cells, index)).length;
	const counted = `${chapters} ${chapters === 1 ? 'chapter' : 'chapters'}`;
	return stale > 0 ? `${counted} · ${stale} to run` : counted;
}

function cellElement(cell: Cell, index: number): HTMLElement {
	const row = document.createElement('section');
	row.className = 'cell';
	// The kind is the cell's identity, so the stylesheet is told it rather than
	// being told a class per kind that means the same thing.
	row.dataset.kind = cell.kind;
	if (index === selected) {
		row.classList.add('selected');
	}
	if (editing === index) {
		row.classList.add('editing');
	}
	if (writing?.at === index) {
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

function select(index: number): void {
	if (selected === index) {
		return;
	}
	selected = index;
	for (const other of cellsEl.querySelectorAll('.cell.selected')) {
		other.classList.remove('selected');
	}
	cellsEl.querySelectorAll('.cell')[index]?.classList.add('selected');
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
	const running = writing?.at === index;
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
			vscode.postMessage({ type: 'stop', at: index });
		} else if (built) {
			commit(runCell(cells, index));
		} else {
			vscode.postMessage({ type: 'generate', at: index });
		}
	});
	column.append(run);

	// Only a cell built from the document can be out of step with it. What a model
	// wrote has nothing to disagree with, and a draft the author has since edited
	// is not out of date — it is theirs.
	if (built) {
		const stale = isStale(cells, index);
		const state = document.createElement('i');
		state.className = stale
			? 'state stale codicon codicon-circle-large-outline'
			: 'state fresh codicon codicon-pass-filled';
		state.dataset.tip = stale
			? 'Out of date — the document has moved on since this was built'
			: 'Up to date with the document';
		column.append(state);
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
	if (writing?.at === index) {
		body.append(writingBarFor(writing));
	}

	// A chapter is its title and nothing else — there is no prose in it to show,
	// and the writing beneath it is markdown cells of its own.
	if (hasProse(cell.kind)) {
		body.append(
			editing === index ? sourceFor(cell, index) : renderedFor(cell, index)
		);
	}
	body.append(kindLabelFor(cell));
	return body;
}

/**
 * Grow the box to its text.
 *
 * Counting newlines is not enough — a paragraph wraps into as many lines as the
 * width allows, and a box sized to the logical lines gets a scrollbar of its own.
 * One document, one scrollbar.
 */
function autosize(input: HTMLTextAreaElement): void {
	input.style.height = 'auto';
	input.style.height = `${input.scrollHeight}px`;
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
			const next = [...cells];
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

function sourceFor(cell: Cell, index: number): HTMLElement {
	// The document this box was opened against. If it moves on, nothing typed in
	// here may be written back over what replaced it.
	const opened = generation;
	const input = document.createElement('textarea');
	input.className = 'source';
	input.value = cell.source;
	input.rows = 1;
	input.addEventListener('input', () => {
		autosize(input);
		if (typingTimer !== undefined) {
			clearTimeout(typingTimer);
		}
		typingTimer = setTimeout(() => {
			if (opened === generation) {
				settle(index, input.value);
			}
		}, TYPING_DEBOUNCE_MS);
	});
	input.addEventListener('keydown', (event) => {
		// Accept the cell the way a notebook accepts one, and leave Enter to do
		// what Enter does in prose.
		if (event.key === 'Escape' || (event.key === 'Enter' && event.shiftKey)) {
			event.preventDefault();
			if (opened === generation) {
				accept(index, input.value);
			}
		}
	});
	input.addEventListener('blur', () => {
		if (opened === generation) {
			accept(index, input.value);
		}
	});
	// Both once the box is on the page: `scrollHeight` needs a laid-out element,
	// and `preventScroll` because focusing is what was yanking the page around.
	queueMicrotask(() => {
		autosize(input);
		input.focus({ preventScroll: true });
	});
	return input;
}

function renderedFor(cell: Cell, index: number): HTMLElement {
	const rendered = document.createElement('div');
	rendered.className = 'rendered';
	if (cell.source) {
		rendered.innerHTML = withBase(
			marked(
				renderMarkdown(
					fenced(cell.source, foundIn(index, null), found[current] ?? null)
				)
			)
		);
	} else {
		rendered.classList.add('blank');
		rendered.textContent = writing?.at === index
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

/**
 * The strip in a gap between cells, where a cell is added at `at`.
 *
 * Insertion belongs here rather than in the toolbar: what an author means by
 * "add a chapter" is nearly always "add one *here*", and a toolbar button has to
 * be told where here is. The bar is where the cursor already was.
 */
function insertBarFor(at: number): HTMLElement {
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

/** Add a cell, and select it — it is the one the author is about to write in. */
function insertCell(at: number, cell: Cell): void {
	selected = at;
	commit(insertAt(cells, at, cell));
}

/** Move a cell, keeping the selection on it rather than on where it used to be. */
function moveCell(index: number, by: number): void {
	const next = moveBy(cells, index, by);
	if (next === cells) {
		return;
	}
	selected = index + by;
	commit(next);
}

function insertButton(
	label: string,
	onClick: (event: MouseEvent) => void,
	icon = 'add',
	title?: string
): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = label ? 'insert' : 'insert icon-only';
	button.dataset.tip = title ?? `Add a ${label.toLowerCase()} section here`;
	const glyph = document.createElement('i');
	glyph.className = `codicon codicon-${icon}`;
	button.append(glyph);
	if (label) {
		button.append(document.createTextNode(label));
	}
	button.addEventListener('click', (event) => {
		event.stopPropagation();
		onClick(event);
	});
	return button;
}

// --- the seam, where a section is cut in two or joined to the one above ---

/**
 * The line that offers to divide a section, hidden until the pointer says where.
 *
 * It hangs over the cell rather than standing in it, so following the pointer
 * from paragraph to paragraph moves nothing the author is reading. One per
 * section that can be divided; a section that is one thing has none at all.
 */
function seamFor(index: number): HTMLElement {
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
			selected = index - 1;
			commit(mergeAt(cells, index));
		} else {
			selected = index + 1;
			commit(splitAt(cells, index, seamAt.line));
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
function showSeam(row: HTMLElement, index: number, pointer: number): void {
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

function hideSeam(row: HTMLElement, index: number): void {
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
	const cell = cells[index];
	if (!cell || editing === index || writing?.at === index) {
		return [];
	}
	const seams: Seam[] = [];
	if (mergesUp(cells, index)) {
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

/** The actions that float at the cell's top-right corner. */
function actionsFor(index: number): HTMLElement {
	const actions = document.createElement('div');
	actions.className = 'actions';
	actions.append(
		iconButton('chevron-up', 'Move up', () => moveCell(index, -1)),
		iconButton('chevron-down', 'Move down', () => moveCell(index, 1)),
		iconButton('trash', 'Delete this section', () => {
			selected = Math.max(0, index - 1);
			commit(removeAt(cells, index));
		})
	);
	return actions;
}

/** Open a cell for writing, if it is the author's to write. */
function beginEditing(index: number): void {
	const cell = cells[index];
	// A built cell is the document's to write, not the author's to type into.
	if (!cell || isAutomated(cell.kind) || !hasProse(cell.kind)) {
		return;
	}
	// Neither is one the server is writing, until it has finished: what is typed
	// into it now is either lost under what comes back or written over it.
	if (writing?.at === index) {
		return;
	}
	const was = editing;
	editing = index;
	selected = index;
	if (was !== null && was !== index) {
		redrawCell(was);
	}
	redrawCell(index);
}

/**
 * Shut whatever cell is open for typing, and cut its box loose.
 *
 * The textarea's own handlers are still attached to a cell that is about to say
 * something else, and letting their blur write back would put the author's
 * abandoned text over whatever arrived.
 */
function closeEditing(): void {
	if (editing === null) {
		return;
	}
	generation += 1;
	editing = null;
	if (typingTimer !== undefined) {
		clearTimeout(typingTimer);
		typingTimer = undefined;
	}
}

/** Write what has been typed without closing the cell. */
function settle(index: number, source: string): void {
	if (cells[index] && cells[index].source !== source) {
		const next = [...cells];
		next[index] = { ...cells[index], source };
		// The box the author is typing in already says this, so what comes back is
		// not news — recorded before it goes, or the echo would repaint the cell
		// out from under the caret.
		drawn = signatureOf(next);
		commit(next);
	}
}

function accept(index: number, source: string): void {
	if (typingTimer !== undefined) {
		clearTimeout(typingTimer);
		typingTimer = undefined;
	}
	// Only if this cell is still the open one. Moving from one cell to the next
	// closes this one by taking its textarea away, and the blur that fires must
	// not close the cell that has just been opened instead.
	if (editing === index) {
		editing = null;
	}
	settle(index, source);
	redrawCell(index);
}

/**
 * Relative image paths are written for the file's folder, which the webview is
 * not; the host says what that folder is from in here.
 */
function withBase(html: string): string {
	if (!base) {
		return html;
	}
	return html.replace(
		/<img src="(?!https?:|data:)([^"]*)"/g,
		(_m, src) => `<img src="${base}/${src}"`
	);
}

/** A button carrying one of VS Code's own icons, named as the codicon is named. */
function iconButton(
	icon: string,
	title: string,
	onClick: (event: MouseEvent) => void
): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'icon';
	button.setAttribute('aria-label', title);
	button.dataset.tip = title;
	const glyph = document.createElement('i');
	glyph.className = `codicon codicon-${icon}`;
	button.append(glyph);
	button.addEventListener('click', (event) => {
		event.stopPropagation();
		onClick(event);
	});
	return button;
}

// --- find and replace ---

/**
 * What is being looked for, and where it is.
 *
 * The query outlives the widget being shut, as it does in the editor next door —
 * an author who closes the box and opens it again is looking for the same thing.
 * `found` is the whole document's worth of matches in reading order, and
 * `current` is the one the author is standing on.
 */
let query: Query = { text: '', matchCase: false, wholeWord: false, regex: false };
let found: Match[] = [];
let current = -1;
let searching = false;

/**
 * The cells drawn with marks on them.
 *
 * Kept so that a cell which has just lost its last match is redrawn too — the
 * marks are in the HTML of the cell, and nothing else would take them off.
 */
let marks = new Set<number>();
let markedCell: number | null = null;

for (const [id, act] of [
	['find-next', () => step(1)],
	['find-previous', () => step(-1)],
	['find-close', closeFind],
	['find-toggle', () => showReplace(replaceRowEl.hidden === true)],
	['find-replace', replaceCurrent],
	['find-replace-all', replaceEverywhere],
] as const) {
	document.getElementById(id)!.addEventListener('click', act);
}

for (const [id, turned] of [
	['find-case', () => ({ ...query, matchCase: !query.matchCase })],
	['find-word', () => ({ ...query, wholeWord: !query.wholeWord })],
	['find-regex', () => ({ ...query, regex: !query.regex })],
] as const) {
	document.getElementById(id)!.addEventListener('click', () => {
		query = turned();
		research();
	});
}

whatEl.addEventListener('input', () => {
	query = { ...query, text: whatEl.value };
	research();
});

whatEl.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') {
		event.preventDefault();
		step(event.shiftKey ? -1 : 1);
	}
});

withEl.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') {
		event.preventDefault();
		if (event.ctrlKey || event.metaKey || event.altKey) {
			replaceEverywhere();
		} else {
			replaceCurrent();
		}
	}
});

/**
 * Open the widget on whatever is selected.
 *
 * Taking the focus is also what settles a cell that was open for typing: the box
 * writes itself back as it loses focus, so what is searched is the document and
 * not a page that is still ahead of it.
 */
function openFind(replace: boolean): void {
	const seed = selectedText();
	if (seed) {
		query = { ...query, text: seed };
		whatEl.value = seed;
	}
	searching = true;
	findEl.hidden = false;
	if (replace) {
		showReplace(true);
	}
	research();
	whatEl.focus();
	whatEl.select();
}

function closeFind(): void {
	searching = false;
	findEl.hidden = true;
	refind();
	repaint(true);
}

function showReplace(on: boolean): void {
	replaceRowEl.hidden = !on;
	(replaceToggleEl.firstElementChild as HTMLElement).className =
		`codicon codicon-chevron-${on ? 'down' : 'right'}`;
}

/** Ask the document again, and show the answer from the top of it. */
function research(): void {
	current = -1;
	refind();
	showCount();
	repaint(true);
	reveal();
}

/**
 * Ask the document what it holds now, keeping the author where they were.
 *
 * Where they were is a place in the document rather than a number: an edit
 * anywhere above them would otherwise renumber the matches under their feet and
 * send them back to a chapter they had finished with.
 */
function refind(): void {
	const was = found[current] ?? null;
	found = searching ? matchesIn(cells, query) : [];
	current = was ? nextFrom(was) : found.length > 0 ? 0 : -1;
}

/** The first match at or after a place, wrapping to the top when there is none. */
function nextFrom(place: Match): number {
	const at = found.findIndex(
		(match) =>
			match.cell > place.cell || (match.cell === place.cell && match.at >= place.at)
	);
	return at >= 0 ? at : found.length > 0 ? 0 : -1;
}

function step(by: number): void {
	if (found.length === 0) {
		return;
	}
	current = (current + by + found.length) % found.length;
	showCount();
	repaint(false);
	reveal();
}

function showCount(): void {
	if (!searching) {
		return;
	}
	countEl.textContent = !query.text
		? ''
		: found.length === 0
			? 'No results'
			: `${current + 1} of ${found.length}`;
	// An unfinished regular expression is not an error to report; the box says so
	// and the document is left alone until it means something.
	findBoxEl.classList.toggle('invalid', !isUnderstood(query));
	for (const [id, on] of [
		['find-case', query.matchCase],
		['find-word', query.wholeWord],
		['find-regex', query.regex],
	] as const) {
		document.getElementById(id)!.classList.toggle('on', on);
	}
	for (const id of ['find-previous', 'find-next', 'find-replace', 'find-replace-all']) {
		(document.getElementById(id) as HTMLButtonElement).disabled = found.length === 0;
	}
}

/**
 * Redraw the cells whose marks have changed.
 *
 * `everything` when the matches themselves have moved — a new query, or a
 * document that says something else. Stepping from one match to the next only
 * moves which one is current, and then the two cells that changes are the only
 * two worth rebuilding; a search that hits three hundred chapters would
 * otherwise rebuild all three hundred on every press of Enter.
 */
function repaint(everything: boolean): void {
	const wanted = new Set(found.map((match) => match.cell));
	const here = found[current]?.cell ?? null;
	const touched = everything ? new Set([...marks, ...wanted]) : new Set<number>();
	if (markedCell !== null) {
		touched.add(markedCell);
	}
	if (here !== null) {
		touched.add(here);
	}
	marks = wanted;
	markedCell = here;
	for (const index of touched) {
		// Never the cell that is open for typing: it is the author's box, its text
		// is ahead of the document anyway, and rebuilding it takes the caret.
		if (index !== editing && cells[index]) {
			redrawCell(index);
		}
	}
}

/** Record what a full redraw has just drawn, so the next one knows what to undo. */
function noteMarks(): void {
	marks = new Set(found.map((match) => match.cell));
	markedCell = found[current]?.cell ?? null;
}

/**
 * Bring the current match on screen without taking the focus off the box.
 *
 * The author is still typing what they are looking for; a match that took the
 * caret with it would put the next keystroke in the manuscript.
 */
function reveal(): void {
	const match = found[current];
	if (!match) {
		return;
	}
	const row = cellsEl.querySelectorAll('.cell')[match.cell];
	const at =
		row?.querySelector('.find-match.current') ??
		row?.querySelector('.find-field.current') ??
		row;
	at?.scrollIntoView({ block: 'center' });
}

function replaceCurrent(): void {
	const match = found[current];
	if (!match) {
		return;
	}
	commit(replaced(cells, match, query, withEl.value));
	// Past what was just written, not at it: replacing "the" with "there" would
	// otherwise land on the match it had just made and never move on.
	current = nextFrom({ ...match, at: match.at + withEl.value.length });
	showCount();
	repaint(true);
	reveal();
}

function replaceEverywhere(): void {
	if (found.length === 0) {
		return;
	}
	commit(replacedAll(cells, query, withEl.value));
	repaint(true);
	reveal();
}

/** The matches in one of a cell's texts. */
function foundIn(index: number, field: string | null): Match[] {
	return found.filter((match) => match.cell === index && match.field === field);
}

/**
 * What the author has selected, when it is a line of it worth searching for.
 *
 * The box seeds itself from the selection the way the editor's does. Its own
 * selection is not a seed — opening find twice would then search for whatever it
 * had already highlighted in the box.
 */
function selectedText(): string {
	const focused = document.activeElement;
	if (focused === whatEl || focused === withEl) {
		return '';
	}
	const text =
		focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement
			? focused.value.slice(focused.selectionStart ?? 0, focused.selectionEnd ?? 0)
			: (window.getSelection()?.toString() ?? '');
	return text.includes('\n') ? '' : text;
}

/** Ctrl+F, and Cmd+F on a Mac. */
function isFindKey(event: KeyboardEvent): boolean {
	return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f';
}

/** Ctrl+H, and Cmd+Alt+F on a Mac, where Cmd+H is the system's own. */
function isReplaceKey(event: KeyboardEvent): boolean {
	if (event.altKey) {
		// Alt makes the key itself say something else on a Mac; what is meant is
		// where the key is on the keyboard.
		return (event.ctrlKey || event.metaKey) && event.code === 'KeyF';
	}
	return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h';
}

// --- the menu ---

/**
 * The kinds the bar has no button for, added after `index`.
 *
 * The everyday few are already buttons an inch to the left, so listing them here
 * again would be two ways to click the same thing. Between the buttons and this,
 * every kind is one click from the bar and none of them twice.
 */
function openInsertMenu(x: number, y: number, at: number): void {
	menuEl.textContent = '';
	for (const kind of KINDS.filter((k) => !k.primary)) {
		menuEl.append(menuItem(kind.label, () => insertCell(at, kind.blank())));
	}
	placeMenu(x, y);
}

/** What can be done to this cell. Adding one is the insert bar's question. */
function openCellMenu(x: number, y: number, index: number): void {
	menuEl.textContent = '';
	const kind = cells[index]?.kind ?? '';
	menuEl.append(menuHeading(labelOf(kind)));
	if (isAutomated(kind)) {
		menuEl.append(menuItem('Run', () => commit(runCell(cells, index))));
	} else if (isGenerated(kind)) {
		menuEl.append(
			writing?.at === index
				? menuItem('Stop', () => vscode.postMessage({ type: 'stop', at: index }))
				: menuItem('Write', () =>
						vscode.postMessage({ type: 'generate', at: index })
					)
		);
	}
	menuEl.append(
		menuItem('Move up', () => moveCell(index, -1)),
		menuItem('Move down', () => moveCell(index, 1)),
		menuItem('Delete', () => {
			selected = Math.max(0, index - 1);
			commit(removeAt(cells, index));
		})
	);
	placeMenu(x, y);
}

function placeMenu(x: number, y: number): void {
	menuEl.hidden = false;
	// Placed after it is shown, so its measured height keeps it on screen.
	menuEl.style.left = `${Math.max(4, Math.min(x, window.innerWidth - menuEl.offsetWidth - 8))}px`;
	menuEl.style.top = `${Math.max(4, Math.min(y, window.innerHeight - menuEl.offsetHeight - 8))}px`;
}

function closeMenu(): void {
	menuEl.hidden = true;
}

function menuHeading(text: string): HTMLElement {
	const heading = document.createElement('div');
	heading.className = 'menu-heading';
	heading.textContent = text;
	return heading;
}

function menuItem(text: string, onClick: () => void): HTMLElement {
	const item = document.createElement('button');
	item.type = 'button';
	item.className = 'menu-item';
	item.textContent = text;
	item.addEventListener('click', () => {
		closeMenu();
		onClick();
	});
	return item;
}

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
	if (!menuEl.hidden && !menuEl.contains(event.target as Node)) {
		closeMenu();
	}
});

document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && !menuEl.hidden) {
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
	if (event.key === 'Enter' && !typing && editing === null) {
		event.preventDefault();
		beginEditing(selected);
	}
});

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'askSpellCheck') {
		answerSpellCheck();
	} else if (message?.type === 'writing') {
		const was = writing?.at ?? null;
		writing =
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
		if (writing !== null && editing === writing.at) {
			closeEditing();
		}
		// The cell that has stopped has its run button to get back, and it is not
		// always the cell that has started.
		if (was !== null && was !== writing?.at) {
			redrawCell(was);
		}
		if (writing) {
			redrawCell(writing.at);
		}
	} else if (message?.type === 'cells') {
		const incoming = withDefaultCell(message.cells as Cell[]);
		base = String(message.base ?? '');
		// Most of what arrives here is this view's own edit coming back around,
		// which is not news and must not disturb a cell being typed in.
		if (signatureOf(incoming) === drawn) {
			cells = incoming;
			return;
		}
		// The document says something the view did not write — reverted, corrected,
		// or edited elsewhere. That wins over anything open: a cell left showing
		// the old text would write it back the moment the author clicked away.
		cells = incoming;
		selected = Math.min(selected, Math.max(0, cells.length - 1));
		closeEditing();
		refind();
		showCount();
		render();
	}
});

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
vscode.postMessage({ type: 'ready' });
