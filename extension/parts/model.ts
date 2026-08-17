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
// Deliberately free of the `vscode` module, so a division can be read and tested
// without launching an editor. Everything here deals in cells and counts;
// divide.ts turns the parts into files.

import { isMatter, isUnpublished } from '../author_editor/model';
import { CHAPTER, COVER, EXTENSION, TITLE_PAGE, type Cell } from '../storydoc/model';

/** A chapter and the cells written under it, with what a reader counts in them. */
export interface Section {
	cells: Cell[];
	words: number;
}

/** Whole sections, gathered into one part. */
export interface Part {
	sections: Section[];
	words: number;
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

/** The length a part is asked to be. */
export const DEFAULT_PART_WORDS = 5000;

/**
 * The story, as the sections a division cuts along.
 *
 * A chapter cell opens a section and the prose under it belongs to that section
 * until the next chapter opens. Which cells those are is the document's to say,
 * so a heading someone wrote in their prose stays prose — the one thing cutting
 * along `##` in flattened markdown could never get right.
 *
 * The book's furniture is not the story and belongs to every part rather than to
 * one; what the author keeps beside the story and publishes nowhere belongs to
 * neither.
 */
export function sectionsOf(cells: readonly Cell[]): Section[] {
	const sections: Section[] = [];

	for (const cell of cells) {
		if (cell.kind === CHAPTER) {
			sections.push({
				cells: [cell],
				words: countWords(cell.attrs.title ?? ''),
			});
			continue;
		}
		const holding = sections[sections.length - 1];
		if (!holding || isMatter(cell.kind) || isUnpublished(cell.kind)) {
			continue;
		}
		holding.cells.push(cell);
		holding.words += countWords(cell.source);
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
 * Fill each part with as many whole sections as it will hold.
 *
 * A section joins the part being filled while doing so lands nearer the quota
 * than stopping short would — so a part runs over only by less than it would
 * otherwise run under, and a section that would blow past the quota starts the
 * next part instead. A part always takes at least one section: a section longer
 * than the quota is still a section, and there is nowhere smaller to put it.
 */
export function intoParts(sections: readonly Section[], quota: number): Part[] {
	const parts: Part[] = [];
	let held: Section[] = [];
	let words = 0;

	for (const section of sections) {
		if (held.length > 0 && !nearer(words, section.words, quota)) {
			parts.push({ sections: held, words });
			held = [];
			words = 0;
		}
		held.push(section);
		words += section.words;
	}
	if (held.length > 0) {
		parts.push({ sections: held, words });
	}
	return parts;
}

/** Under the quota it always is; over it, only while the overshoot is the
 *  smaller of the two misses. */
function nearer(words: number, adding: number, quota: number): boolean {
	const over = words + adding - quota;
	return over <= 0 || over < quota - words;
}

/** A part as a document of its own: the furniture, then its share of the story. */
export function partCells(
	furniture: Furniture,
	number: number,
	part: Part
): Cell[] {
	return [
		...furniture.front.map((cell) => carried(cell, number)),
		...part.sections.flatMap((section) => section.cells),
		...furniture.back.map((cell) => carried(cell, number)),
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
function carried(cell: Cell, number: number): Cell {
	if (cell.kind === TITLE_PAGE) {
		return {
			...cell,
			attrs: {
				...cell.attrs,
				title: partTitle(cell.attrs.title ?? '', number),
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

/** What separates a story's title from the part number after it. */
const PART_MARKER = ' — Part ';

/** What a part is called — the story's title, and which part this is. */
export function partTitle(title: string, number: number): string {
	return title ? `${title}${PART_MARKER}${number}` : `Part ${number}`;
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

/**
 * Whatever the form reported, as a quota.
 *
 * A quota of nothing divides a story into nothing, so anything unusable —
 * blank, negative, not a number — falls back to the default rather than being
 * acted on.
 */
export function quotaOf(raw: unknown): number {
	const words = Math.floor(Number(raw));
	return Number.isFinite(words) && words > 0 ? words : DEFAULT_PART_WORDS;
}

/**
 * Words as a reader counts them: whitespace-separated runs carrying a letter or
 * a digit, so a scene break or a lone dash weighs nothing.
 */
export function countWords(text: string): number {
	return (text.match(/\S+/g) ?? []).filter((run) => /[\p{L}\p{N}]/u.test(run)).length;
}
