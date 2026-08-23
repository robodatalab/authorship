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
import {
	chapter,
	contents,
	dumps,
	markdown,
	parse,
	part,
	type Cell,
} from '../../../extension/storydoc/model';

function blurb(source = ''): Cell {
	return { kind: 'blurb', source, attrs: {} };
}

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

/**
 * The echo of what the view just posted, as the host makes it.
 *
 * The host does not hand the cells back: it writes them to the document and
 * parses the document again. That round trip is not the identity — it takes the
 * blank lines off either end of a cell — so a test that sent the cells straight
 * back would miss everything that goes wrong on the way through the file.
 */
function echo(): void {
	send(parse(dumps(lastCells())));
}

/** What the host sends while the server writes a cell, and when it stops. */
function writes(at: number | null, written = 0, chapters = 0): void {
	window.dispatchEvent(
		new MessageEvent('message', {
			data: { type: 'writing', at, written, chapters },
		})
	);
}

function shown(): Element[] {
	return [...document.querySelectorAll('.cell')];
}

/** The strips between the cells, in the order the gaps come. */
function bars(): Element[] {
	return [...document.querySelectorAll('.insert-bar')];
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
		for (const [id] of wiring) {
			expect(document.getElementById(id as string), id as string).not.toBeNull();
		}
	});

	it('counts the chapters for the status', async () => {
		await mount([chapter('One'), markdown('a'), chapter('Two')]);
		expect(document.getElementById('doc-status')!.textContent).toContain('2 chapters');
	});

	it('does not count a part among the chapters', async () => {
		await mount([part('Day One'), chapter('One'), chapter('Two')]);
		expect(document.getElementById('doc-status')!.textContent).toContain('2 chapters');
	});

	it('says how many built sections are waiting to be run', async () => {
		await mount([chapter('One'), contents()]);
		expect(document.getElementById('doc-status')!.textContent).toContain('1 to run');
	});

	it('says which chapter is being read', async () => {
		await mount([chapter('One'), markdown('a')]);
		expect(document.getElementById('doc-where')!.textContent).toBe('One');
	});

	it('says the part along with the chapter, once the story has parts', async () => {
		await mount([part('Day One'), chapter('One'), markdown('a')]);
		expect(document.getElementById('doc-where')!.textContent).toBe(
			'Day One \u00b7 One'
		);
	});

	it('says nothing at all before the first chapter', async () => {
		await mount([markdown('a')]);
		expect(document.getElementById('doc-where')!.textContent).toBe('');
	});

	it('follows the title as it is renamed', async () => {
		await mount([chapter('One'), markdown('a')]);
		send([chapter('The First Night'), markdown('a')]);
		expect(document.getElementById('doc-where')!.textContent).toBe(
			'The First Night'
		);
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

	it('gives a part its title field and no prose editor, as a chapter has', async () => {
		await mount([part('Day One')]);
		const cell = shown()[0];
		expect(cell.querySelector<HTMLInputElement>('.cell-title')!.value).toBe('Day One');
		expect(cell.querySelector('.rendered')).toBeNull();
	});

	it('says what kind every cell is, which is what the stylesheet draws it by', async () => {
		// The part is centred on the page by `.cell[data-kind='part']`, so a cell
		// that stopped saying its kind would silently stop being drawn as one.
		await mount([markdown('a'), part('Day One'), chapter('One')]);
		expect(shown().map((cell) => (cell as HTMLElement).dataset.kind)).toEqual([
			'markdown',
			'part',
			'chapter',
		]);
	});

	it('draws a note as prose, saying the kind the stylesheet quietens it by', async () => {
		// Set in italic and a shade greyer by `.cell[data-kind='note']`, so a cell
		// that stopped saying its kind would read as the story it is not.
		await mount([
			{ kind: 'note', source: 'She has to find the letter here.', attrs: {} },
		]);
		const cell = shown()[0];
		expect((cell as HTMLElement).dataset.kind).toBe('note');
		expect(cell.querySelector('.rendered')!.innerHTML).toContain(
			'She has to find the letter here.'
		);
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

	it('gives the author page three link boxes, a blurb, and its own name', async () => {
		await mount([{ kind: 'about', source: '', attrs: {} }]);
		const cell = shown()[0];
		expect(cell.querySelector('.cell-name')!.textContent).toBe('About the Author');
		expect(cell.querySelectorAll('.cell-field-row')).toHaveLength(3);
		// The name is the section's, not a box the author types in.
		expect(cell.querySelector('.cell-title')).toBeNull();
		expect(cell.querySelector('.rendered')).not.toBeNull();
	});

	it('does not put a fixed name on a section the author names', async () => {
		await mount([chapter('One')]);
		expect(shown()[0].querySelector('.cell-name')).toBeNull();
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

	it('opens a cell the server writes, which is still the author’s', async () => {
		// A blurb has a run button like a table of contents, and unlike one it is
		// a draft — asking for it again is the author's choice, not the document's.
		await mount([blurb('A woman loses her name.')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).not.toBeNull();
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

	it('keeps the cell open when what was typed in it comes back', async () => {
		// The other half of the rule the move regression came from: typing is the
		// one edit the view has drawn before it sends it, so this echo — and only
		// this one — has to be dismissed rather than repainted.
		await mount([markdown('a')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const open = shown()[0].querySelector('textarea')!;
		open.value = 'a and then some';
		open.dispatchEvent(new Event('input'));
		await new Promise((wake) => setTimeout(wake, 450));

		send(lastCells());

		expect(shown()[0].querySelector('textarea')).toBe(open);
		expect(open.value).toBe('a and then some');
	});

	it('does not redraw when the document has not changed', async () => {
		// Every edit came back around as a document change; redrawing on each one
		// lost the scroll position and the click that was in flight.
		await mount([markdown('a')]);
		const before = shown()[0];
		send([markdown('a')]);
		expect(shown()[0]).toBe(before);
	});

	it('takes a change that came from somewhere else, even mid-edit', async () => {
		// Reverting the file in git, a correction the server wrote, an edit in a
		// text editor alongside — the document has moved on and the open cell is
		// showing something that is no longer there. The text gives way; the
		// author does not give up the cell over it.
		await mount([markdown('edited')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		send([markdown('reverted')]);
		const open = shown()[0].querySelector('textarea');
		expect(open).not.toBeNull();
		expect(open!.value).toBe('reverted');
	});

	it('does not write the abandoned text back over what arrived', async () => {
		// The textarea's own handlers are still attached when it is torn out, and
		// its blur used to post the old text — quietly undoing the revert.
		await mount([markdown('edited')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const abandoned = shown()[0].querySelector('textarea')!;
		send([markdown('reverted')]);
		abandoned.dispatchEvent(new Event('blur'));
		expect(lastCells().map((c) => c.source)).not.toContain('edited');
		expect(shown()[0].querySelector('textarea')!.value).toBe('reverted');
	});

	it('stays open when a blank line at the foot of the cell comes back trimmed', async () => {
		// Pressing Enter twice closed the cell. The document does not keep the
		// blank lines at the ends of a cell — they are the file's shape, not the
		// author's text — so what came back was not what went out, and the page
		// read its own edit as an edit from somewhere else and rebuilt itself.
		await mount([markdown('a')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const open = shown()[0].querySelector('textarea')!;
		open.value = 'a\n\n';
		open.dispatchEvent(new Event('input'));
		await new Promise((wake) => setTimeout(wake, 450));

		echo();

		expect(shown()[0].querySelector('textarea')).toBe(open);
		expect(open.value).toBe('a\n\n');
	});

	it('stays open when a trailing space comes back trimmed', async () => {
		await mount([markdown('a')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const open = shown()[0].querySelector('textarea')!;
		open.value = 'a word \n';
		open.dispatchEvent(new Event('input'));
		await new Promise((wake) => setTimeout(wake, 450));

		echo();

		expect(shown()[0].querySelector('textarea')).toBe(open);
	});

	it('stays open when the box loses the keyboard', async () => {
		// Every click outside the box shut the cell: the toolbar, the find field,
		// the editor alongside, another window. None of them is the author saying
		// they have finished writing.
		await mount([markdown('a')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const open = shown()[0].querySelector('textarea')!;
		open.value = 'a and more';
		open.dispatchEvent(new Event('input'));
		open.dispatchEvent(new Event('blur'));

		expect(shown()[0].querySelector('textarea')).toBe(open);
		// And what was typed is written down all the same, since the timer that
		// would have done it is no longer being waited on.
		expect(lastCells().map((cell) => cell.source)).toContain('a and more');
	});

	it('stays open on Ctrl+S, and saves what has just been typed', async () => {
		// The save is VS Code's and reads the document, which is behind the box —
		// a cell reaches the document 400ms after the last keystroke.
		await mount([markdown('a')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const open = shown()[0].querySelector('textarea')!;
		open.value = 'a and more';
		open.dispatchEvent(new Event('input'));
		open.dispatchEvent(
			new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })
		);

		expect(shown()[0].querySelector('textarea')).toBe(open);
		expect(lastCells().map((cell) => cell.source)).toContain('a and more');
		expect(posted.at(-1)).toEqual({ type: 'save' });
	});

	it('carries the open cell with it when the cell is moved', async () => {
		await mount([markdown('a'), markdown('b')]);
		shown()[1]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		(shown()[1].querySelector('[aria-label="Move up"]') as HTMLElement).click();
		echo();
		expect(shown()[0].querySelector('textarea')!.value).toBe('b');
		expect(shown()[1].querySelector('textarea')).toBeNull();
	});

	it('gives up the cell when it is the one deleted', async () => {
		await mount([markdown('a'), markdown('b')]);
		shown()[1]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		(
			shown()[1].querySelector('[aria-label="Delete this section"]') as HTMLElement
		).click();
		echo();
		expect(document.querySelector('textarea.source')).toBeNull();
	});

	it('redraws when the document has changed', async () => {
		await mount([markdown('a')]);
		send([markdown('a'), markdown('b')]);
		expect(shown()).toHaveLength(2);
	});
});

describe('leaving a cell', () => {
	// Which keystrokes end the writing, and — the half that keeps going wrong —
	// which ones only look as though they should. A cell is given up by accepting
	// it or by opening another one, and by nothing else: everything that merely
	// takes the keyboard away writes the cell down and leaves it open.

	/** Open a cell the way the author does, and hand back the box. */
	async function writing(source = 'a'): Promise<HTMLTextAreaElement> {
		await mount([markdown(source)]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		return shown()[0].querySelector('textarea')!;
	}

	/** Type into the box the way the keyboard does, timer and all. */
	function type(box: HTMLTextAreaElement, text: string): void {
		box.value = text;
		box.dispatchEvent(new Event('input'));
	}

	function press(box: HTMLElement, key: string, held: KeyboardEventInit = {}): void {
		box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...held }));
	}

	it('writes the cell down and shuts it on Escape', async () => {
		const box = await writing();
		type(box, 'a and more');
		press(box, 'Escape');

		expect(shown()[0].querySelector('textarea')).toBeNull();
		expect(lastCells().map((cell) => cell.source)).toContain('a and more');
	});

	it('writes the cell down and shuts it on Shift+Enter', async () => {
		// The way a notebook accepts a cell.
		const box = await writing();
		type(box, 'a and more');
		press(box, 'Enter', { shiftKey: true });

		expect(shown()[0].querySelector('textarea')).toBeNull();
		expect(lastCells().map((cell) => cell.source)).toContain('a and more');
	});

	it('leaves plain Enter to do what Enter does in prose', async () => {
		const box = await writing();
		press(box, 'Enter');
		expect(shown()[0].querySelector('textarea')).toBe(box);
	});

	it('gives up the other cursors before it gives up the cell', async () => {
		// Escape means one thing at a time. An author who has taken three places
		// and changed their mind about the third has not finished with the cell.
		const box = await writing('wren and wren');
		box.setSelectionRange(0, 4);
		press(box, 'd', { ctrlKey: true });
		expect(document.querySelectorAll('.source-cursors .at')).not.toHaveLength(0);

		press(box, 'Escape');
		expect(shown()[0].querySelector('textarea')).toBe(box);
		expect(document.querySelectorAll('.source-cursors .at')).toHaveLength(0);
	});

	it('shuts the cell on the Escape after that one', async () => {
		const box = await writing('wren and wren');
		box.setSelectionRange(0, 4);
		press(box, 'd', { ctrlKey: true });
		press(box, 'Escape');
		press(box, 'Escape');
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});

	it('keeps the other cursors through a save', async () => {
		// Ctrl+S is answered before anything else in the box, and answering it is
		// writing the cell down — not standing the author back on the page.
		const box = await writing('wren and wren');
		box.setSelectionRange(0, 4);
		press(box, 'd', { ctrlKey: true });
		press(box, 's', { ctrlKey: true });

		expect(shown()[0].querySelector('textarea')).toBe(box);
		expect(document.querySelectorAll('.source-cursors .at')).not.toHaveLength(0);
	});

	it('opens the cell the author is standing on, when Enter is pressed on the page', async () => {
		await mount([markdown('a'), markdown('b')]);
		shown()[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		press(document.documentElement, 'Enter');

		expect(shown()[1].querySelector('textarea')).not.toBeNull();
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});

	it('writes down the cell being left when another one is opened', async () => {
		// The blur that closes the first box lands after the second is drawn, so
		// what was typed has to be written down before the redraw rather than by it.
		await mount([markdown('a'), markdown('b')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		type(shown()[0].querySelector('textarea')!, 'a and more');
		shown()[1]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

		expect(shown()[0].querySelector('textarea')).toBeNull();
		expect(shown()[1].querySelector('textarea')).not.toBeNull();
		expect(lastCells().map((cell) => cell.source)).toEqual(['a and more', 'b']);
	});
});

describe('changing the document', () => {
	it('puts a bar in every gap, the one above the first cell included', async () => {
		// Without the leading one there is no way to put anything in front of what
		// is already written, and a cover has to come before the title page.
		await mount([markdown('a'), markdown('b')]);
		expect(bars()).toHaveLength(3);
	});

	it('adds a section above the first cell', async () => {
		await mount([markdown('a')]);
		bars()[0].querySelectorAll<HTMLElement>('.insert')[1].click();
		expect(lastCells().map((c) => c.kind)).toEqual(['chapter', 'markdown']);
	});

	it('adds a note from the bar, beside the two kinds it is written among', async () => {
		// A note is reached for as often as the prose it is about, so it is a
		// button rather than something behind the overflow.
		await mount([markdown('a')]);
		const labels = [...bars()[0].querySelectorAll<HTMLElement>('.insert')].map(
			(button) => button.textContent
		);
		expect(labels).toEqual(['Markdown', 'Chapter', 'Note', '']);

		bars()[0].querySelectorAll<HTMLElement>('.insert')[2].click();
		expect(lastCells().map((c) => c.kind)).toEqual(['note', 'markdown']);
	});

	it('adds a section in the gap its bar belongs to', async () => {
		await mount([markdown('a'), markdown('b')]);
		bars()[1].querySelectorAll<HTMLElement>('.insert')[1].click();
		expect(lastCells().map((c) => c.kind)).toEqual([
			'markdown',
			'chapter',
			'markdown',
		]);
	});

	it('adds a section below the last cell', async () => {
		await mount([markdown('a')]);
		bars().at(-1)!.querySelectorAll<HTMLElement>('.insert')[1].click();
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

	it('draws the move once the document comes back', async () => {
		// The regression this replaces: the view recorded everything it sent as
		// already drawn, so the document coming back was taken for the view's own
		// echo and dismissed. The cells moved in the file and never on screen.
		await mount([markdown('a'), markdown('b')]);
		shown()[0].querySelectorAll<HTMLElement>('.actions .icon')[1].click();
		send(lastCells());
		expect(shown().map((c) => c.querySelector('.rendered')!.textContent)).toEqual([
			'b',
			'a',
		]);
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

	it('asks the host to write a cell the server writes', async () => {
		// A built cell is made here in an instant; a generated one takes as long as
		// a model takes, so the host runs it and shows the progress.
		await mount([chapter('One'), blurb()]);
		shown()[1].querySelector<HTMLElement>('.run')!.click();
		expect(posted.at(-1)).toEqual({ type: 'generate', at: 1 });
	});

	it('gives a generated cell no freshness of its own', async () => {
		// Only a cell built from the document can disagree with it. A draft the
		// author has edited is not out of date — it is theirs.
		await mount([blurb()]);
		expect(shown()[0].querySelector('.run')).not.toBeNull();
		expect(shown()[0].querySelector('.state')).toBeNull();
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

	it('offers Write on a cell the server writes', async () => {
		await mount([blurb()]);
		shown()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const listed = [...document.querySelectorAll('#menu .menu-item')].map(
			(item) => item.textContent
		);
		expect(listed).toContain('Write');
		expect(listed).not.toContain('Run');
	});

	it('lists the blurb among the kinds a section can be', async () => {
		await mount([markdown('a')]);
		document.querySelector<HTMLElement>('.insert-bar .insert.icon-only')!.click();
		const listed = [...document.querySelectorAll('#menu .menu-item')].map(
			(item) => item.textContent
		);
		expect(listed).toContain('Blurb');
	});
});

describe('a cell the server is writing', () => {
	// The author's half of a job that runs for minutes: they can see it moving,
	// they can stop it, and they cannot type into what is about to be replaced.

	it('turns the run button into the button that stops it', async () => {
		await mount([blurb('An older draft.')]);
		writes(0);
		expect(shown()[0].querySelector('.run .codicon-primitive-square')).not.toBeNull();
		expect(shown()[0].querySelector('.run .codicon-play')).toBeNull();
		expect(shown()[0].querySelector<HTMLElement>('.run')!.dataset.tip).toBe(
			'Stop writing this blurb'
		);
	});

	it('stops the job rather than starting a second one', async () => {
		await mount([blurb()]);
		writes(0);
		shown()[0].querySelector<HTMLElement>('.run')!.click();
		expect(posted.at(-1)).toEqual({ type: 'stop', at: 0 });
		expect(posted.filter((m) => m.type === 'generate')).toHaveLength(0);
	});

	it('draws how far through the story it has read', async () => {
		await mount([blurb()]);
		writes(0, 3, 14);
		const fill = shown()[0].querySelector<HTMLElement>('.writing-fill')!;
		expect(Math.round(parseFloat(fill.style.width))).toBe(21);
		expect(shown()[0].querySelector('.writing-said')!.textContent).toBe(
			'Writing — chapter 4 of 14'
		);
	});

	it('says only that it is writing until it knows how long the book is', async () => {
		// The document is read before the first chapter goes to the model, and
		// nothing is a fraction of nothing.
		await mount([blurb()]);
		writes(0, 0, 0);
		expect(shown()[0].querySelector<HTMLElement>('.writing-fill')!.style.width).toBe(
			'0%'
		);
		expect(shown()[0].querySelector('.writing-said')!.textContent).toBe('Writing…');
	});

	it('does not name a chapter after the last one', async () => {
		await mount([blurb()]);
		writes(0, 14, 14);
		expect(shown()[0].querySelector('.writing-said')!.textContent).toBe(
			'Writing — chapter 14 of 14'
		);
	});

	it('refuses to open the cell for typing', async () => {
		await mount([blurb('An older draft.')]);
		writes(0, 1, 14);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});

	it('refuses the keyboard way in as well', async () => {
		await mount([blurb('An older draft.')]);
		shown()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		writes(0, 1, 14);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});

	it('takes the cell back off the author if they were already typing in it', async () => {
		// What they have typed is about to be written over; leaving the box open
		// would let its blur put it back on top of the blurb.
		await mount([blurb('An older draft.')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).not.toBeNull();
		writes(0, 1, 14);
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});

	it('does not write back what was in the box when it was taken away', async () => {
		await mount([blurb('An older draft.')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const box = shown()[0].querySelector('textarea')!;
		box.value = 'half a sentence the author was';
		writes(0, 1, 14);
		box.dispatchEvent(new Event('blur'));
		expect(lastCells()).toEqual([]);
	});

	it('offers Stop in the menu in place of Write', async () => {
		await mount([blurb()]);
		writes(0, 1, 14);
		shown()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const listed = [...document.querySelectorAll('#menu .menu-item')].map(
			(item) => item.textContent
		);
		expect(listed).toContain('Stop');
		expect(listed).not.toContain('Write');
	});

	it('leaves every other cell alone', async () => {
		await mount([markdown('a'), blurb()]);
		writes(1, 1, 14);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).not.toBeNull();
		expect(shown()[0].querySelector('.writing')).toBeNull();
	});

	it('gives the cell back when the writing stops', async () => {
		// Stopping is the same news as finishing: the job is not running, and the
		// cell is the author's again.
		await mount([blurb('An older draft.')]);
		writes(0, 4, 14);
		writes(null);
		expect(shown()[0].querySelector('.run .codicon-play')).not.toBeNull();
		expect(shown()[0].querySelector('.run .codicon-primitive-square')).toBeNull();
		expect(shown()[0].querySelector('.writing')).toBeNull();
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).not.toBeNull();
	});

	it('takes the bar and the stop button with it when the job moves on', async () => {
		await mount([blurb('One.'), blurb('Two.')]);
		writes(0, 1, 14);
		writes(1, 1, 9);
		expect(shown()[0].querySelector('.run .codicon-play')).not.toBeNull();
		expect(shown()[0].querySelector('.writing')).toBeNull();
		expect(shown()[1].querySelector('.run .codicon-primitive-square')).not.toBeNull();
		expect(shown()[1].querySelector('.writing')).not.toBeNull();
	});

	it('keeps the cell locked while the document changes underneath it', async () => {
		// A blurb job saves the file first, so the document comes back mid-write.
		await mount([blurb('An older draft.')]);
		writes(0, 2, 14);
		send([blurb('An older draft.'), markdown('a')]);
		expect(shown()[0].querySelector('.run .codicon-primitive-square')).not.toBeNull();
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(shown()[0].querySelector('textarea')).toBeNull();
	});
});

describe('dividing a section', () => {
	// happy-dom lays nothing out, so every seam measures to the same place and the
	// first one found wins. Which one that is, is model.test.ts's question; that
	// there is one, that it is on the right sections, and that pressing it divides
	// the document, is this one's.

	it('draws a line over a section of prose the pointer is on', async () => {
		await mount([markdown('one\n\ntwo')]);
		shown()[0].dispatchEvent(new MouseEvent('mousemove'));
		expect((shown()[0].querySelector('.seam') as HTMLElement).hidden).toBe(false);
	});

	it('draws none over a section that is one thing', async () => {
		await mount([chapter('One'), contents()]);
		expect(shown()[0].querySelector('.seam')).toBeNull();
		expect(shown()[1].querySelector('.seam')).toBeNull();
	});

	it('draws none over a section with nowhere to cut', async () => {
		await mount([markdown('one')]);
		shown()[0].dispatchEvent(new MouseEvent('mousemove'));
		expect((shown()[0].querySelector('.seam') as HTMLElement).hidden).toBe(true);
	});

	it('draws none over a section that is open for writing', async () => {
		await mount([markdown('one\n\ntwo')]);
		shown()[0]
			.querySelector('.rendered')!
			.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		shown()[0].dispatchEvent(new MouseEvent('mousemove'));
		expect((shown()[0].querySelector('.seam') as HTMLElement).hidden).toBe(true);
	});

	it('takes the line away when the pointer leaves', async () => {
		await mount([markdown('one\n\ntwo')]);
		shown()[0].dispatchEvent(new MouseEvent('mousemove'));
		shown()[0].dispatchEvent(new MouseEvent('mouseleave'));
		expect((shown()[0].querySelector('.seam') as HTMLElement).hidden).toBe(true);
	});

	it('cuts the section at the line when the button is pressed', async () => {
		await mount([markdown('one\n\ntwo')]);
		shown()[0].dispatchEvent(new MouseEvent('mousemove'));
		(shown()[0].querySelector('.seam-action') as HTMLElement).dispatchEvent(
			new MouseEvent('click')
		);
		expect(lastCells()).toEqual([markdown('one'), markdown('two')]);
	});

	it('offers the section below the join to the one of its kind above it', async () => {
		await mount([markdown('one'), markdown('two')]);
		shown()[1].dispatchEvent(new MouseEvent('mousemove'));
		const seam = shown()[1].querySelector('.seam') as HTMLElement;
		expect(seam.hidden).toBe(false);
		expect(seam.querySelector('.codicon-merge')).not.toBeNull();
		(seam.querySelector('.seam-action') as HTMLElement).dispatchEvent(
			new MouseEvent('click')
		);
		expect(lastCells()).toEqual([markdown('one\n\ntwo')]);
	});

	it('offers no join where the section above is another kind', async () => {
		await mount([chapter('One'), markdown('two')]);
		shown()[1].dispatchEvent(new MouseEvent('mousemove'));
		expect((shown()[1].querySelector('.seam') as HTMLElement).hidden).toBe(true);
	});
});
