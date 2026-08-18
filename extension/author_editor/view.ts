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
	insertAt,
	withDefaultCell,
	hasProse,
	isAutomated,
	isGenerated,
	isNamed,
	isStale,
	fieldsOf,
	labelOf,
	moveBy,
	removeAt,
	renderMarkdown,
	runCell,
	sourceLinesOf,
} from './model';
import type { CellField } from './model';
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
		rendered.innerHTML = withBase(renderMarkdown(cell.source));
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
		render();
	}
});

// The host has nothing to push until we ask: a message it posted before this
// script ran would simply be gone.
vscode.postMessage({ type: 'ready' });
