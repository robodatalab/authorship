// Dividing a story into parts: which chapters travel together, and what each
// part is once they do.
//
// A part is an `.author` document like the story it was cut from — the book's
// furniture carried over, its title page renumbered, and its share of the
// chapters. That is the whole point of cutting into this format rather than into
// markdown: everything that works on a story works on a part. It opens in the
// same editor, exports to the same EPUB, and nothing here has to know how either
// of those is done.
//
// Where the cuts fall is the author's own answer, given in the document rather
// than to a form: the story divides where its Parts stand, one file per Part. A
// Part that is only there to place a cut is marked unprinted and the book goes
// out without a page for it, so dividing the files costs the reader nothing.
//
// Deliberately free of the `vscode` module, so a division can be read and tested
// without launching an editor. Everything here deals in cells; divide.ts turns
// the parts into files.

import { isAside, isMatter, isUnpublished } from '../author_editor/model';
import { CHAPTER, COVER, EXTENSION, PART, TITLE_PAGE, type Cell } from '../storydoc_model';
import { printsPage } from '../storydoc_model';

/** A chapter and the cells written under it. */
export interface Section {
	cells: Cell[];
	/**
	 * What the story calls the part this section stands in, or '' where it stands
	 * in none.
	 *
	 * Only a part the book prints names anything. One marked unprinted places a
	 * cut and says nothing else, so a file cut at a seam inside "Day One" is
	 * still a file of "Day One".
	 */
	under: string;
}

/** Whole sections, gathered into one part. */
export interface Part {
	sections: Section[];
	/** The part of the story these sections were taken from, or '' for the
	 *  chapters that stand before the first the book prints. */
	under: string;
}

/**
 * What every part carries besides its own chapters.
 *
 * Split at the story rather than listed by kind, so a disclaimer the author put
 * after the last chapter is still after the last chapter in every part.
 */
export interface Furniture {
	front: Cell[];
	back: Cell[];
}

/**
 * The story, as the sections a division cuts along.
 *
 * A chapter cell opens a section and the prose under it belongs to that section
 * until the next chapter opens. Which cells those are is the document's to say,
 * so a heading someone wrote in their prose stays prose — the one thing cutting
 * along `##` in flattened markdown could never get right.
 *
 * A part names the chapters that follow it and stands above the first of them, so
 * it travels with the section it opens rather than joining the one it happens to
 * stand after — which is what makes the section it opens a place to cut. Every
 * section carries the name of the part it fell in, and only a part the book
 * prints has a name to give: one marked unprinted is a seam and leaves the name
 * where it was.
 *
 * The book's furniture is not the story and belongs to every part rather than to
 * one; what the author keeps beside the story and publishes nowhere belongs to
 * neither. An aside is the exception: it was written about the passage it stands
 * beside, so it goes wherever that passage goes.
 */
export function sectionsOf(cells: readonly Cell[]): Section[] {
	const sections: Section[] = [];
	// A part waits here for the chapter it names, and so does anything written
	// between the two: they are the head of that section and not the tail of the
	// one above it.
	let opening: Section | null = null;
	let under = '';

	for (const cell of cells) {
		if (cell.kind === PART) {
			under = printsPage(cell) ? cell.attrs.title ?? '' : under;
			opening = opening ?? { cells: [], under };
			opening.cells.push(cell);
			continue;
		}
		if (cell.kind === CHAPTER) {
			const opened = opening ?? { cells: [], under };
			opened.cells.push(cell);
			opened.under = under;
			sections.push(opened);
			opening = null;
			continue;
		}
		if (isMatter(cell.kind) || (isUnpublished(cell.kind) && !isAside(cell.kind))) {
			continue;
		}
		const holding = opening ?? sections[sections.length - 1];
		if (!holding) {
			continue;
		}
		holding.cells.push(cell);
	}

	// A part nobody wrote a chapter under names nothing, and what stands after it
	// is left where it was written rather than dropped.
	const last = sections[sections.length - 1];
	if (opening && last) {
		last.cells.push(...opening.cells);
	}
	return sections;
}

/** What stands before the story and what stands after it. */
export function furnitureOf(cells: readonly Cell[]): Furniture {
	const opens = cells.findIndex((cell) => cell.kind === CHAPTER);
	// A story with no chapters has nothing for furniture to stand behind.
	const story = opens < 0 ? cells.length : opens;
	const front: Cell[] = [];
	const back: Cell[] = [];

	cells.forEach((cell, at) => {
		if (isMatter(cell.kind)) {
			(at < story ? front : back).push(cell);
		}
	});
	return { front, back };
}

/**
 * One file per part the author marked, in the order they marked them.
 *
 * There is no arithmetic in this and no form to fill in: where a story divides
 * is a question about the story, and the author answers it by putting a Part
 * where the answer is. A Part the book prints divides the files as well — a tale
 * in a book of tales is one file for the same reason it is one tale — and a Part
 * marked unprinted divides the files and nothing else.
 *
 * A story with no Parts at all is asking to be divided nowhere, so it divides
 * into nothing rather than into one file holding all of it.
 */
export function intoParts(sections: readonly Section[]): Part[] {
	if (!sections.some(opensAPart)) {
		return [];
	}
	return divisions(sections).map((run) => ({
		sections: run,
		under: run[0].under,
	}));
}

/**
 * The sections in the runs the author divided them into.
 *
 * Cut where a part cell stands rather than wherever the name changes, so two
 * parts the author happened to give the same name are still two parts — and so
 * are two seams, which have no name to differ by at all. What the author wrote
 * before the first part is a run of its own: it is in the book and has to be in
 * some file.
 */
function divisions(sections: readonly Section[]): Section[][] {
	const runs: Section[][] = [];
	for (const section of sections) {
		if (runs.length === 0 || opensAPart(section)) {
			runs.push([section]);
			continue;
		}
		runs[runs.length - 1].push(section);
	}
	return runs;
}

/** Whether the author put a part where this section starts. */
function opensAPart(section: Section): boolean {
	return section.cells[0]?.kind === PART;
}

/** A part as a document of its own: the furniture, then its share of the story. */
export function partCells(
	furniture: Furniture,
	number: number,
	part: Part
): Cell[] {
	return [
		...furniture.front.map((cell) => carried(cell, number, part.under)),
		...part.sections.flatMap((section) => section.cells),
		...furniture.back.map((cell) => carried(cell, number, part.under)),
	];
}

/**
 * A furniture cell as a part carries it.
 *
 * Two things change on the way. The title page is renumbered, because a reader
 * holding part four has to be able to see what it is part four *of*. And a cover
 * names its art relative to the file naming it, so a part — which sits a folder
 * deeper than the story — has to name it from where it now stands.
 */
function carried(cell: Cell, number: number, under: string): Cell {
	if (cell.kind === TITLE_PAGE) {
		return {
			...cell,
			attrs: {
				...cell.attrs,
				title: partTitle(cell.attrs.title ?? '', number, under),
			},
		};
	}
	return cell.kind === COVER ? fromTheFolder(cell) : cell;
}

/**
 * A markdown image, split at the path so the path alone can be replaced.
 *
 * The same reading `_first_image` does in `server/publishing/epub_exporter.py`,
 * which is what will go looking for the file this points at.
 */
const IMAGE = /(!\[[^\]]*\]\(\s*)([^)\s]+)/;

function firstImage(source: string): string {
	return IMAGE.exec(source)?.[2] ?? '';
}

/**
 * `cover.jpg` beside the story is `../cover.jpg` from inside `parts/`.
 *
 * The art does not move when the parts are written, so the path has to. Both
 * places the file is named are moved: the attribute, and the markdown image
 * under it — a cover written by hand may carry only the second, which is what
 * the exporter falls back to reading.
 *
 * A path that already climbs out of the folder is climbed one further, which is
 * right for the same reason: it was written from where the story stands.
 */
function fromTheFolder(cell: Cell): Cell {
	const src = cell.attrs.src || firstImage(cell.source);
	// An absolute path and a URL both already say where they are from.
	if (src === '' || src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
		return cell;
	}
	const moved = `../${src}`;
	return {
		...cell,
		source: cell.source.replace(IMAGE, (_whole, opening) => `${opening}${moved}`),
		attrs: cell.attrs.src ? { ...cell.attrs, src: moved } : cell.attrs,
	};
}

/** What stands between the pieces of a part's name. */
const PART_MARKER = ' — ';

/**
 * What a part is called — the story, the part of it this came from, and which
 * part of that it is.
 *
 * `Veriona — Day One — Part 3`, so a reader holding one file can see all three.
 * A piece the story does not have is left out rather than left blank: a file cut
 * at a seam the book does not print stands under nothing it can name, and says
 * so by saying nothing.
 */
export function partTitle(title: string, number: number, under = ''): string {
	return [title, under, `Part ${number}`].filter(Boolean).join(PART_MARKER);
}

/** A story divides into `parts/` beside it. */
export const PARTS_FOLDER = 'parts';

export function partFileName(number: number): string {
	return `part_${number}${EXTENSION}`;
}

/**
 * Which part a file in the folder holds, or null if no division wrote it.
 *
 * Asked before writing, so a story that now makes four parts does not sit in a
 * folder still holding a fifth from when it made five — and nothing else in the
 * folder is a division's to remove.
 */
export function partNumber(name: string): number | null {
	const match = new RegExp(`^part_(\\d+)\\${EXTENSION}$`, 'i').exec(name);
	return match === null ? null : Number(match[1]);
}
