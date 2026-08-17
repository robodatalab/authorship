// The webview, driven the way the host drives it.
//
// This is the layer every bug that reached the author lived in — a dead toolbar
// button, a cell that closed itself, a click that landed on a rebuilt element —
// and none of it was covered, because it needs a DOM and the host's message
// channel. Both are cheap: happy-dom provides the first, and the second is one
// stub.
//
// The page is mounted from `page.ts`, the same markup panel.ts serves. A test
// that built its own skeleton would keep passing while the real page went wrong.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BODY } from '../../../extension/author_editor/page';
import { chapter, contents, markdown, type Cell } from '../../../extension/storydoc/model';

let posted: { type: string; [key: string]: unknown }[] = [];

/** Mount the page and load the view against it, as the webview does. */
async function mount(cells: Cell[] = []): Promise<void> {
	posted = [];
	document.body.innerHTML = BODY;
	(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
		postMessage: (message: { type: string }) => posted.push(message),
	});
	vi.resetModules();
	// Loaded fresh each time: the view holds the document in module state, and a
	// second test inheriting the first one's is not a test of anything.
	await import('../../../extension/author_editor/view.js');
	send(cells);
}

/** What the host sends when the document changes. */
function send(cells: Cell[]): void {
	window.dispatchEvent(
		new MessageEvent('message', { data: { type: 'cells', cells, base: '' } })
	);
}

function shown(): Element[] {
	return [...document.querySelectorAll('.cell')];
}

function lastCells(): Cell[] {
	const last = [...posted].reverse().find((m) => m.type === 'cells');
	return (last?.cells ?? []) as Cell[];
}

beforeEach(() => {
	posted = [];
});

describe('starting up', () => {
	it('asks the host for the document, since nothing is pushed before that', async () => {
		await mount();
		expect(posted[0]).toEqual({ type: 'ready' });
	});

	it('gives an empty document one cell to write in', async () => {
		await mount([]);
		expect(shown()).toHaveLength(1);
		expect(shown()[0].querySelector('.rendered')).not.toBeNull();
	});
});

describe('the toolbar', () => {
	// Every one of these was wired by hand at some point and one of them was not.
	const wiring: [string, string][] = [
		['run-all', 'compile'],
		['import-markdown', 'importMarkdown'],
		['export-markdown', 'exportMarkdown'],
		['export-epub', 'exportEpub'],
		['export-parts', 'partition'],
		['as-text', 'openAsText'],
	];

	for (const [id, type] of wiring) {
		it(`#${id} asks the host to ${type}`, async () => {
			await mount([markdown('a')]);
			document.getElementById(id)!.dispatchEvent(new MouseEvent('click'));
			expect(posted.map((m) => m.type)).toContain(type);
		});
	}

	it('has a button on the page for every tool the view wires up', async () => {
		await mount();
		for (const [id] of [...wiring, ['spell']]) {
			expect(document.getElementById(id as string), id as string).not.toBeNull();
		}
	});

	it('spell check reports the selected cell by the lines it occupies', async () => {
		await mount([markdown('one'), markdown('two')]);
		document.getElementById('spell')!.dispatchEvent(new MouseEvent('click'));
		const asked = posted.find((m) => m.type === 'spellCheck');
		expect(asked).toMatchObject({ start: 2, end: 2 });
	});

	it('counts the chapters for the status', async () => {
		await mount([chapter('One'), markdown('a'), chapter('Two')]);
		expect(document.getElementById('doc-status')!.textContent).toContain('2 chapters');
	});

	it('says how many built sections are waiting to be run', async () => {
		await mount([chapter('One'), contents()]);
		expect(document.getElementById('doc-status')!.textContent).toContain('1 to run');
	});
});

describe('drawing cells', () => {
	it('draws one cell per cell', async () => {
		await mount([markdown('a'), chapter('One'), markdown('b')]);
		expect(shown()).toHaveLength(3);
	});

	it('gives a chapter its title field and no prose editor', async () => {
		await mount([chapter('One')]);
		const cell = shown()[0];
		expect(cell.querySelector<HTMLInputElement>('.cell-title')!.value).toBe('One');
		expect(cell.querySelector('.rendered')).toBeNull();
	});

	it('hints at the date format in the empty box', async () => {
		await mount([{ kind: 'title-page', source: '', attrs: { title: 'T' } }]);
		const boxes = [...shown()[0].querySelectorAll<HTMLInputElement>('.cell-field')];
		expect(boxes.map((b) => b.placeholder)).toContain('YYYY-MM-DD');
	});

	it('gives a title page every field it records', async () => {
		await mount([{ kind: 'title-page', source: '', attrs: { title: 'T' } }]);
		const cell = shown()[0];
		expect(cell.querySelectorAll('.cell-field-row')).toHaveLength(6);
		expect(cell.querySelector('.rendered')).toBeNull();
	});

	it('gives a disclaimer both a heading and a prose body', async () => {
		await mount([{ kind: 'disclaimer', source: 'Careful.', attrs: { title: 'Heads Up!' } }]);
		const cell = shown()[0];
		expect(cell.querySelector<HTMLInputElement>('.cell-title')!.value).toBe('Heads Up!');
		expect(cell.querySelector('.rendered')!.textContent).toContain('Careful.');
	});

	it('renders prose as markdown rather than as its source', async () => {
		await mount([markdown('# Heading')]);
		expect(shown()[0].querySelector('.rendered')!.innerHTML).toContain('<h1>');
	});

	it('offers a built cell a run button, and a written one none', async () => {
		await mount([contents(), markdown('a')]);
		expect(shown()[0].querySelector('.run')).not.toBeNull();
		expect(shown()[1].querySelector('.run')).toBeNull();
	});
});

describe('opening a cell', () => {
	it('does not open on a single click — that decided itself by where you landed', async () => {
		await mount([markdown('a')]);
		shown()[0].querySelector('.rendered')!.dispatchEvent(new MouseEvent('click'));
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});

	it('opens on a double click', async () => {
		await mount([markdown('a')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).not.toBeNull();
	});

	it('refuses to open a cell the document writes', async () => {
		await mount([contents()]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});

	it('leaves the open cell alone when the document comes back', async () => {
		// The bug this replaces: the echo of the view's own edit repainted the
		// page, tore out the textarea, and the blur that fired closed the cell.
		await mount([markdown('a')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const open = shown()[0].querySelector('textarea');
		send([markdown('a')]);
		expect(shown()[0].querySelector('textarea')).toBe(open);
	});

	it('does not redraw when the document has not changed', async () => {
		// Every edit came back around as a document change; redrawing on each one
		// lost the scroll position and the click that was in flight.
		await mount([markdown('a')]);
		const before = shown()[0];
		send([markdown('a')]);
		expect(shown()[0]).toBe(before);
	});

	it('redraws when the document has changed', async () => {
		await mount([markdown('a')]);
		send([markdown('a'), markdown('b')]);
		expect(shown()).toHaveLength(2);
	});
});

describe('changing the document', () => {
	it('adds a section from the bar beneath a cell', async () => {
		await mount([markdown('a')]);
		document.querySelector<HTMLElement>('.insert-bar .insert')!.click();
		expect(lastCells().map((c) => c.kind)).toEqual(['markdown', 'markdown']);
	});

	it('adds a chapter from the bar beneath a cell', async () => {
		await mount([markdown('a')]);
		[...document.querySelectorAll<HTMLElement>('.insert-bar .insert')][1].click();
		expect(lastCells().map((c) => c.kind)).toEqual(['markdown', 'chapter']);
	});

	it('deletes the cell the button belongs to', async () => {
		await mount([markdown('a'), markdown('b')]);
		shown()[0].querySelector<HTMLElement>('.actions .icon:last-child')!.click();
		expect(lastCells().map((c) => c.source)).toEqual(['b']);
	});

	it('moves a cell down', async () => {
		await mount([markdown('a'), markdown('b')]);
		shown()[0].querySelectorAll<HTMLElement>('.actions .icon')[1].click();
		expect(lastCells().map((c) => c.source)).toEqual(['b', 'a']);
	});

	it('records a chapter title as the author types it', async () => {
		await mount([chapter('One')]);
		const title = shown()[0].querySelector<HTMLInputElement>('.cell-title')!;
		title.value = 'Renamed';
		title.dispatchEvent(new Event('change'));
		expect(lastCells()[0].attrs.title).toBe('Renamed');
	});

	it('drops a field the author has emptied rather than storing nothing', async () => {
		await mount([{ kind: 'title-page', source: '', attrs: { title: 'T', isbn: 'X' } }]);
		const isbn = [...shown()[0].querySelectorAll<HTMLInputElement>('.cell-field')].at(-1)!;
		isbn.value = '';
		isbn.dispatchEvent(new Event('change'));
		expect(lastCells()[0].attrs).not.toHaveProperty('isbn');
	});

	it('runs one built cell without touching the others', async () => {
		await mount([chapter('One'), contents(), contents()]);
		shown()[1].querySelector<HTMLElement>('.run')!.click();
		expect(lastCells()[1].source).toBe('1. One');
		expect(lastCells()[2].source).toBe('');
	});
});

describe('the menus', () => {
	it('lists only the kinds the bar has no button for', async () => {
		await mount([markdown('a')]);
		document.querySelector<HTMLElement>('.insert-bar .insert.icon-only')!.click();
		const listed = [...document.querySelectorAll('#menu .menu-item')].map(
			(item) => item.textContent
		);
		expect(listed).not.toContain('Markdown');
		expect(listed).not.toContain('Chapter');
		expect(listed).toContain('Table of Contents');
		expect(listed).toContain('Disclaimer');
	});

	it('offers what can be done to a cell, and nothing about adding one', async () => {
		await mount([markdown('a')]);
		shown()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const listed = [...document.querySelectorAll('#menu .menu-item')].map(
			(item) => item.textContent
		);
		expect(listed).toEqual(['Move up', 'Move down', 'Delete']);
	});

	it('offers Run on a cell the document writes', async () => {
		await mount([contents()]);
		shown()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const listed = [...document.querySelectorAll('#menu .menu-item')].map(
			(item) => item.textContent
		);
		expect(listed).toContain('Run');
	});
});
