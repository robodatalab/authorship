// What the server said stands between this document and a book, and what the
// editor does about it.
//
// **No opinions live here.** Which sections a book cannot go out without, which
// of them are absent, out of place or empty — all of it is decided in
// `server/publishing/epub_exporter.py`, by the same code that does the binding,
// and arrives in the answer to an export. This module carries that answer into
// the document and into words the author reads. It is deliberately incapable of
// deciding any of it itself: a second opinion about what a book needs is a
// second thing to keep in step with the exporter, and it would be wrong first.
//
// Free of the `vscode` module and of the DOM, so all of it can be unit tested
// without an editor and the page can mark cells with it.

import { blankOf, fieldsOf, labelOf } from '../author_editor/model';
import type { Cell } from '../storydoc/model';

/** One place in the laid-out document, and where its cell comes from. */
export interface Slot {
	kind: string;
	/** Its index in the document as it stands, or null for one to be written in. */
	at: number | null;
}

/** A section the book needs that has nothing in it yet. */
export interface Wanting {
	kind: string;
	/** Field names, or `art` and `text` for what is not typed into a box. */
	needs: string[];
}

/** What the export answered. */
export interface Report {
	ready: boolean;
	plan: Slot[];
	added: string[];
	moved: string[];
	wanting: Wanting[];
	/** Where the book was written, when one was. */
	path?: string;
}

/** What a section wants that is not one of its fields. */
const ART = 'art';
const TEXT = 'text';

/**
 * The document laid out as the server planned it.
 *
 * The author's own cells are carried across by the indices the plan gives, so a
 * cover whose art has been pointed somewhere else is moved rather than replaced,
 * however they have since rewritten it. Only a section the document has not got
 * is written, and it is written blank — what lands in the manuscript is a
 * section to fill in rather than an answer.
 */
export function applyPlan(cells: Cell[], plan: Slot[]): Cell[] {
	return plan.map((slot) =>
		slot.at === null ? blankOf(slot.kind) : cells[slot.at]
	);
}

/** The kinds the author still has to write, for the page to mark. */
export function wantingKinds(report: Report): string[] {
	return report.wanting.map((item) => item.kind);
}

/**
 * What a section still wants, in the words the author knows it by.
 *
 * The server answers in field names because what a field is called in front of
 * the author is the editor's to say, and it already says it on the box itself.
 */
export function needsSaid(kind: string, needs: string[]): string {
	const fields = fieldsOf(kind);
	const said = needs.map((need) => {
		if (need === ART) {
			return 'its artwork';
		}
		if (need === TEXT) {
			return 'something written in it';
		}
		return fields.find((field) => field.name === need)?.label ?? need;
	});
	return said.join(', ');
}

/**
 * What to put to the author when the book cannot be bound.
 *
 * Three faults, told apart, because they are three different things to do
 * something about: a section that is not there, one that is somewhere a reader
 * would not look for it, and one that is there with nothing in it. The last is
 * the one that needs saying plainly — adding a title page does not give a book a
 * title, and an author who fixed the layout a moment ago will not otherwise
 * understand why the export still will not run.
 */
export function askOf(
	name: string,
	report: Report
): { message: string; detail: string } {
	const named = (kinds: string[]): string =>
		kinds.map((kind) => labelOf(kind)).join(', ');

	const said: string[] = [];
	if (report.added.length) {
		said.push(`Missing: ${named(report.added)}`);
	}
	if (report.moved.length) {
		said.push(`Out of place: ${named(report.moved)}`);
	}
	for (const item of report.wanting) {
		said.push(`${labelOf(item.kind)} needs ${needsSaid(item.kind, item.needs)}`);
	}
	said.push(
		'Fix lays the sections out and marks what is still to write. It does not export. ' +
			'Export Anyway binds the book as it stands.'
	);

	return {
		message: `${name} is not ready to bind.`,
		detail: said.join('\n'),
	};
}

/**
 * What to say once the document has been laid out.
 *
 * Named rather than counted, because the author is about to go and fill these in
 * and the names are what they will look for.
 */
export function doneOf(name: string, report: Report): string {
	const named = (kinds: string[]): string =>
		kinds.map((kind) => labelOf(kind)).join(', ');

	const said = [
		report.added.length && `Added ${named(report.added)}`,
		report.moved.length && `moved ${named(report.moved)} into place`,
	].filter(Boolean);

	const laid = said.length ? `${said.join(' and ')} in ${name}.` : `${name} laid out.`;
	return report.wanting.length
		? `${laid} The sections still to write are marked.`
		: laid;
}
