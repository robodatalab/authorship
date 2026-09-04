import { describe, expect, it } from 'vitest';

import { blankOf } from '../../../extension/graveyard/author_editor/model';
import {
	applyPlan,
	askOf,
	doneOf,
	needsSaid,
	wantingKinds,
	type Report,
} from '../../../extension/publish/layout';
import {
	CHAPTER,
} from '../../../extension/storydoc/model';
import {
	type Cell,
	chapter,
	cover,
	markdown,
} from '../../../extension/graveyard/storydoc_model';

/** A report shaped as the server sends one. */
function report(over: Partial<Report> = {}): Report {
	return {
		ready: false,
		plan: [],
		added: [],
		moved: [],
		wanting: [],
		...over,
	};
}

describe('applyPlan — the document laid out as the server planned it', () => {
	it('carries the author’s own cells across by index', () => {
		const mine = cover('art/mine.png');
		const cells = [chapter('One'), mine];
		const laid = applyPlan(cells, [
			{ kind: 'cover', at: 1 },
			{ kind: CHAPTER, at: 0 },
		]);
		// The same object, not a copy and not a placeholder laid over it.
		expect(laid[0]).toBe(mine);
		expect(laid[1]).toBe(cells[0]);
	});

	it('writes a blank for a section the document has not got', () => {
		const laid = applyPlan([chapter('One')], [
			{ kind: 'cover', at: null },
			{ kind: CHAPTER, at: 0 },
			{ kind: 'about', at: null },
		]);
		expect(laid.map((cell) => cell.kind)).toEqual(['cover', CHAPTER, 'about']);
		expect(laid[0]).toEqual(blankOf('cover'));
		expect(laid[2]).toEqual(blankOf('about'));
	});

	it('keeps the story in the order the plan gives', () => {
		const cells = [chapter('One'), markdown('The lantern.'), chapter('Two')];
		const laid = applyPlan(cells, [
			{ kind: 'contents', at: null },
			{ kind: CHAPTER, at: 0 },
			{ kind: 'markdown', at: 1 },
			{ kind: CHAPTER, at: 2 },
		]);
		expect(laid.slice(1)).toEqual(cells);
	});

	it('carries a kind it has never heard of', () => {
		// The format is open, and the plan names whatever the document held.
		const strange: Cell = { kind: 'epigraph', source: 'Whom the gods…', attrs: {} };
		expect(applyPlan([strange], [{ kind: 'epigraph', at: 0 }])).toEqual([strange]);
	});
});

describe('needsSaid — what a section wants, in the author’s words', () => {
	it('names a field as the box beside it is named', () => {
		expect(needsSaid('title-page', ['title', 'author'])).toBe('Title, Author');
	});

	it('says what is wanted when it is not typed into a box', () => {
		expect(needsSaid('cover', ['art'])).toBe('its artwork');
		expect(needsSaid('blurb', ['text'])).toBe('something written in it');
	});

	it('falls back to what the server called it', () => {
		expect(needsSaid('title-page', ['sideburns'])).toBe('sideburns');
	});
});

describe('askOf — what the author is asked when the book will not bind', () => {
	it('tells the three faults apart', () => {
		const { message, detail } = askOf(
			'story.author',
			report({
				added: ['cover', 'blurb'],
				moved: ['about'],
				wanting: [{ kind: 'title-page', needs: ['author', 'date'] }],
			})
		);
		expect(message).toBe('story.author is not ready to bind.');
		expect(detail).toContain('Missing: Cover, Blurb');
		expect(detail).toContain('Out of place: About the Author');
		expect(detail).toContain('Title Page needs Author, Date');
	});

	it('says a section is not filled in even when nothing is missing', () => {
		// The fault a document can have while looking complete.
		const { detail } = askOf(
			'story.author',
			report({ wanting: [{ kind: 'title-page', needs: ['author'] }] })
		);
		expect(detail).not.toContain('Missing:');
		expect(detail).not.toContain('Out of place:');
		expect(detail).toContain('Title Page needs Author');
	});

	it('says that fixing does not export, and exporting does not fix', () => {
		const { detail } = askOf('story.author', report({ added: ['cover'] }));
		expect(detail).toContain('It does not export.');
		expect(detail).toContain('Export Anyway binds the book as it stands.');
	});

	it('names sections as the menus name them, not as the format does', () => {
		const { detail } = askOf('story.author', report({ added: ['title-page'] }));
		expect(detail).not.toContain('title-page');
		expect(detail).toContain('Title Page');
	});
});

describe('doneOf — what the author is told once it is laid out', () => {
	it('names what was written in and says the rest is marked', () => {
		expect(
			doneOf(
				'story.author',
				report({
					added: ['cover', 'blurb'],
					wanting: [{ kind: 'cover', needs: ['art'] }],
				})
			)
		).toBe(
			'Added Cover, Blurb in story.author. The sections still to write are marked.'
		);
	});

	it('reports adding and moving together', () => {
		const said = doneOf(
			'story.author',
			report({ added: ['cover'], moved: ['about'] })
		);
		expect(said).toBe(
			'Added Cover and moved About the Author into place in story.author.'
		);
	});

	it('says nothing about marks when nothing is left to write', () => {
		const said = doneOf('story.author', report({ moved: ['about'] }));
		expect(said).not.toContain('marked');
	});
});

describe('wantingKinds — what the page marks', () => {
	it('is the kinds the server named, and nothing else', () => {
		expect(
			wantingKinds(
				report({
					wanting: [
						{ kind: 'cover', needs: ['art'] },
						{ kind: 'title-page', needs: ['author'] },
					],
				})
			)
		).toEqual(['cover', 'title-page']);
	});

	it('is empty for a document with everything written', () => {
		expect(wantingKinds(report({ ready: true }))).toEqual([]);
	});
});
