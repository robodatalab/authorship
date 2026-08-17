// The cell surface, running inside the webview. Everything here is DOM and the
// message channel; the document it edits lives host-side in author_editor/panel.ts.
//
// Laid out the way a notebook is laid out, because that is what it is: a run
// column down the left, the cell filling the width beside it, its actions
// floating at the top right of whichever cell has focus, and what the cell is
// named quietly in its bottom corner.
//
// The host owns the truth. A cell being typed into is the one exception — it
// holds its own text until it settles, because a repaint mid-keystroke would
// take the caret with it. Everything else is drawn from what the host last sent.

import {
	KINDS,
	insertAt,
	withDefaultCell,
	hasProse,
	isAutomated,
	isStale,
	isTitled,
	labelOf,
	moveBy,
	removeAt,
	renderMarkdown,
	runCell,
	sourceLinesOf,
} from './model';
import type { Cell } from '../storydoc/model';

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const cellsEl = document.getElementById('cells') as HTMLElement;
const menuEl = document.getElementById('menu') as HTMLElement;
const toolbarEl = document.getElementById('toolbar') as HTMLElement;
const runAllButton = document.getElementById('run-all') as HTMLButtonElement;
const spellButton = document.getElementById('spell') as HTMLButtonElement;
const asTextButton = document.getElementById('as-text') as HTMLButtonElement;
const exportEpubButton = document.getElementById('export-epub') as HTMLButtonElement;
const exportMarkdownButton = document.getElementById('export-markdown') as HTMLButtonElement;
const importMarkdownButton = document.getElementById('import-markdown') as HTMLButtonElement;
const partitionButton = document.getElementById('partition') as HTMLButtonElement;
const statusEl = document.getElementById('doc-status') as HTMLElement;

/** How long after the last keystroke an open cell is written to the document. */
const TYPING_DEBOUNCE_MS = 400;

let cells: Cell[] = [];
/** Where images in a cell resolve from; the host rewrites the folder for us. */
let base = '';
/** The cell the caret is in, or null when none is open for editing. */
let editing: number | null = null;
/** The cell the toolbar acts on. */
let selected = 0;
let typingTimer: ReturnType<typeof setTimeout> | undefined;
/** What the page was last drawn from, so an unchanged document is not redrawn. */
let drawn = '';

function signatureOf(list: Cell[]): string {
	return JSON.stringify(list);
}

function commit(next: Cell[]): void {
	cells = next;
	vscode.postMessage({ type: 'cells', cells });
}

// --- the toolbar ---

runAllButton.addEventListener('click', () => vscode.postMessage({ type: 'compile' }));

spellButton.addEventListener('click', () => {
	const where = sourceLinesOf(cells, selected);
	if (!where) {
		return;
	}
	vscode.postMessage({
		type: 'spellCheck',
		line: where.start,
		start: where.start,
		end: where.end,
	});
});

for (const [button, type] of [
	[exportEpubButton, 'exportEpub'],
	[exportMarkdownButton, 'exportMarkdown'],
	[importMarkdownButton, 'importMarkdown'],
	[partitionButton, 'partition'],
] as const) {
	button.addEventListener('click', () => vscode.postMessage({ type }));
}

asTextButton.addEventListener('click', () => vscode.postMessage({ type: 'openAsText' }));

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
		cellsEl.append(cellElement(cell, index));
		cellsEl.append(insertBarFor(index));
	});
	statusEl.textContent = documentStatus();
	drawn = signatureOf(cells);
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
	drawn = signatureOf(cells);
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
	if (index === selected) {
		row.classList.add('selected');
	}
	if (editing === index) {
		row.classList.add('editing');
	}
	row.addEventListener('mousedown', () => select(index));
	row.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		select(index);
		openCellMenu(event.clientX, event.clientY, index);
	});

	row.append(runColumnFor(cell, index), bodyFor(cell, index), actionsFor(index));
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
 * The narrow column down the left: the run button for a cell that is built, and
 * under it whether what it holds is still what it would build to.
 *
 * Reserved even for a cell nobody runs, so the bodies line up down the page.
 */
function runColumnFor(cell: Cell, index: number): HTMLElement {
	const column = document.createElement('div');
	column.className = 'run-column';

	if (!isAutomated(cell.kind)) {
		return column;
	}

	const run = document.createElement('button');
	run.type = 'button';
	run.className = 'run';
	run.title = `Build this ${labelOf(cell.kind).toLowerCase()} from the document`;
	const glyph = document.createElement('i');
	glyph.className = 'codicon codicon-play';
	run.append(glyph);
	run.addEventListener('click', (event) => {
		event.stopPropagation();
		commit(runCell(cells, index));
	});

	const stale = isStale(cells, index);
	const state = document.createElement('i');
	state.className = stale
		? 'state stale codicon codicon-circle-large-outline'
		: 'state fresh codicon codicon-pass-filled';
	state.title = stale
		? 'Out of date — the document has moved on since this was built'
		: 'Up to date with the document';

	column.append(run, state);
	return column;
}

function bodyFor(cell: Cell, index: number): HTMLElement {
	const body = document.createElement('div');
	body.className = 'body';

	if (isTitled(cell.kind)) {
		const title = document.createElement('input');
		title.className = 'cell-title';
		title.value = cell.attrs.title ?? '';
		title.placeholder = 'Untitled';
		title.addEventListener('change', () => {
			const next = [...cells];
			next[index] = { ...cell, attrs: { ...cell.attrs, title: title.value } };
			commit(next);
		});
		body.append(title);
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

function sourceFor(cell: Cell, index: number): HTMLElement {
	const input = document.createElement('textarea');
	input.className = 'source';
	input.value = cell.source;
	input.rows = Math.max(3, cell.source.split('\n').length + 1);
	input.addEventListener('input', () => {
		input.rows = Math.max(3, input.value.split('\n').length + 1);
		if (typingTimer !== undefined) {
			clearTimeout(typingTimer);
		}
		typingTimer = setTimeout(() => settle(index, input.value), TYPING_DEBOUNCE_MS);
	});
	input.addEventListener('keydown', (event) => {
		// Accept the cell the way a notebook accepts one, and leave Enter to do
		// what Enter does in prose.
		if (event.key === 'Escape' || (event.key === 'Enter' && event.shiftKey)) {
			event.preventDefault();
			accept(index, input.value);
		}
	});
	input.addEventListener('blur', () => accept(index, input.value));
	// `preventScroll`, because focusing is what was yanking the page around.
	queueMicrotask(() => input.focus({ preventScroll: true }));
	return input;
}

function renderedFor(cell: Cell, index: number): HTMLElement {
	const rendered = document.createElement('div');
	rendered.className = 'rendered';
	if (cell.source) {
		rendered.innerHTML = withBase(renderMarkdown(cell.source));
	} else {
		rendered.classList.add('blank');
		rendered.textContent = isAutomated(cell.kind)
			? 'Empty — run this section to build it.'
			: 'Empty — double-click to write.';
	}
	// Clicking selects; opening a cell is a double-click, as it is in a notebook.
	// One gesture that sometimes opened a cell and sometimes did not was the
	// whole trouble — where in the cell you happened to land decided it.
	rendered.addEventListener('dblclick', () => beginEditing(index));
	return rendered;
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
 * The strip under a cell where the next one is added.
 *
 * Insertion belongs here rather than in the toolbar: what an author means by
 * "add a chapter" is nearly always "add one *here*", and a toolbar button has to
 * be told where here is. The bar is where the cursor already was.
 */
function insertBarFor(index: number): HTMLElement {
	const bar = document.createElement('div');
	bar.className = 'insert-bar';

	for (const kind of KINDS.filter((k) => k.primary)) {
		bar.append(
			insertButton(kind.label, () =>
				commit(insertAt(cells, index + 1, kind.blank()))
			)
		);
	}
	bar.append(
		insertButton(
			'',
			(event) => {
				const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
				openInsertMenu(box.left, box.bottom + 2, index);
			},
			'ellipsis',
			'Add any kind of section here'
		)
	);
	return bar;
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
	button.title = title ?? `Add a ${label.toLowerCase()} section here`;
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

/** The actions that float at the cell's top-right corner. */
function actionsFor(index: number): HTMLElement {
	const actions = document.createElement('div');
	actions.className = 'actions';
	actions.append(
		iconButton('chevron-up', 'Move up', () => commit(moveBy(cells, index, -1))),
		iconButton('chevron-down', 'Move down', () => commit(moveBy(cells, index, 1))),
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
	const was = editing;
	editing = index;
	selected = index;
	if (was !== null && was !== index) {
		redrawCell(was);
	}
	redrawCell(index);
}

/** Write what has been typed without closing the cell. */
function settle(index: number, source: string): void {
	if (cells[index] && cells[index].source !== source) {
		const next = [...cells];
		next[index] = { ...cells[index], source };
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
	button.title = title;
	const glyph = document.createElement('i');
	glyph.className = `codicon codicon-${icon}`;
	button.append(glyph);
	button.addEventListener('click', (event) => {
		event.stopPropagation();
		onClick(event);
	});
	return button;
}

// --- the menu ---

/**
 * The kinds the bar has no button for, added after `index`.
 *
 * The everyday two are already buttons an inch to the left, so listing them here
 * again would be two ways to click the same thing. Between the buttons and this,
 * every kind is one click from the bar and none of them twice.
 */
function openInsertMenu(x: number, y: number, index: number): void {
	menuEl.textContent = '';
	for (const kind of KINDS.filter((k) => !k.primary)) {
		menuEl.append(
			menuItem(kind.label, () => commit(insertAt(cells, index + 1, kind.blank())))
		);
	}
	placeMenu(x, y);
}

/** What can be done to this cell. Adding one is the insert bar's question. */
function openCellMenu(x: number, y: number, index: number): void {
	menuEl.textContent = '';
	menuEl.append(menuHeading(labelOf(cells[index]?.kind ?? '')));
	if (isAutomated(cells[index]?.kind ?? '')) {
		menuEl.append(menuItem('Run', () => commit(runCell(cells, index))));
	}
	menuEl.append(
		menuItem('Move up', () => commit(moveBy(cells, index, -1))),
		menuItem('Move down', () => commit(moveBy(cells, index, 1))),
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
	if (message?.type === 'cells') {
		cells = withDefaultCell(message.cells as Cell[]);
		base = String(message.base ?? '');
		selected = Math.min(selected, Math.max(0, cells.length - 1));
		// An open cell is the author's, not the document's: repainting would tear
		// out the textarea they are typing in. And most of what arrives here is
		// this view's own edit coming back around, which is not news either.
		if (editing === null && signatureOf(cells) !== drawn) {
			render();
		}
	}
});

// Keep the toolbar from swallowing a click meant to dismiss the menu.
toolbarEl.addEventListener('mousedown', (event) => event.stopPropagation());

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
vscode.postMessage({ type: 'ready' });
