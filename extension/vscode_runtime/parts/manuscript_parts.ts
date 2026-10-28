// Dividing a story into parts: which chapters travel together, and what each
// part is once they do.
//
// A part is an `.author` document like the story it was cut from — the book's
// part boilerplate carried over, its title page renumbered, and its share of the
// chapters. That is the whole point of cutting into this format rather than into
// markdown: everything that works on a story works on a part. It opens in the
// same editor, exports to the same EPUB, and nothing here has to know how either
// of those is done.
//
// Where the cuts fall is the author's own answer, given in the document rather
// than to a form: the story divides where its Dividers stand, one file per
// Divider. A Divider is a page in no book and a line of no manuscript, so
// dividing the files costs the reader nothing.
//
// Deliberately free of the `vscode` module, so a division can be read and tested
// without launching an editor. Everything here deals in cells; divide_manuscript.ts
// turns the parts into files.

import { standsOutsideTheStory } from "authordoc/story_sections";
import { EXTENSION } from "authordoc/storydoc";
import { ABOUT } from "authordoc/cells/about_cell";
import type { Cell } from "authordoc/cells/cell";
import { ChapterCell } from "authordoc/cells/chapter_cell";
import { DISCLAIMER } from "authordoc/cells/disclaimer_cell";
import { DividerCell } from "authordoc/cells/divider_cell";
import { ImageCell } from "authordoc/cells/image_cell";
import { PartCell } from "authordoc/cells/part_cell";
import { TABLE_OF_CONTENTS } from "authordoc/cells/table_of_contents_cell";
import { TITLE_PAGE, TitlePageCell } from "authordoc/cells/title_page_cell";

const KINDS_EVERY_PART_CARRIES = new Set([
    TITLE_PAGE,
    TABLE_OF_CONTENTS,
    DISCLAIMER,
    ABOUT,
]);

/** The cells of the story that travel together, as one part. */
export interface Part {
    cells: Cell[];
    /** The part of the story these cells were taken from, or '' for the
     *  chapters that stand before the first Part. */
    under: string;
}

/**
 * What every part carries besides its own chapters.
 *
 * Split at the story rather than listed by kind, so a disclaimer the author put
 * after the last chapter is still after the last chapter in every part.
 */
export interface PartBoilerplate {
    front: Cell[];
    back: Cell[];
}

/** What stands before the story and what stands after it. */
export function partBoilerplateOf(cells: readonly Cell[]): PartBoilerplate {
    const opens = cells.findIndex((cell) => cell instanceof ChapterCell);
    // A story with no chapters has nothing for part boilerplate to stand behind.
    const story = opens < 0 ? cells.length : opens;
    const opening = picturesTheStoryOpensWith(cells);
    const front: Cell[] = [];
    const back: Cell[] = [];

    cells.forEach((cell, at) => {
        if (at < opening || KINDS_EVERY_PART_CARRIES.has(cell.kind)) {
            (at < story ? front : back).push(cell);
        }
    });
    return { front, back };
}

function picturesTheStoryOpensWith(cells: readonly Cell[]): number {
    let opening = 0;
    while (cells[opening] instanceof ImageCell) {
        opening += 1;
    }
    return opening;
}

/**
 * One file per Divider the author placed, in the order they placed them.
 *
 * There is no arithmetic in this and no form to fill in: where a story divides
 * is a question about the story, and the author answers it by putting a Divider
 * where the answer is. The cut falls exactly there and nowhere near it, so an
 * author who puts one in the middle of a chapter has asked for a file that opens
 * in the middle of a chapter, and gets one.
 *
 * A story with no Dividers at all is asking to be divided nowhere, so it divides
 * into nothing rather than into one file holding all of it.
 *
 * The book's part boilerplate is not the story and belongs to every part rather than to
 * one; what the author keeps beside the story and publishes nowhere belongs to
 * neither. An aside is the exception: it was written about the passage it stands
 * beside, so it goes wherever that passage goes.
 *
 * A Part names the chapters that follow it, and a file cut anywhere under one is
 * still a file of it. The Divider itself is written into neither file: it said
 * where to cut, which was the only thing it had to say.
 */
export function intoParts(cells: readonly Cell[]): Part[] {
    if (!cells.some((cell) => cell instanceof DividerCell)) {
        return [];
    }
    const parts: Part[] = [];
    let open: Part | null = null;
    let under = "";

    for (const cell of cells.slice(picturesTheStoryOpensWith(cells))) {
        if (standsOutsideTheStory(cell.kind)) {
            continue;
        }
        if (cell instanceof DividerCell) {
            open = null;
            continue;
        }
        if (cell instanceof PartCell) {
            under = cell.title;
        }
        if (!open) {
            open = { cells: [], under };
            parts.push(open);
        }
        open.cells.push(cell);
    }
    return parts;
}

/** A part as a document of its own: the part boilerplate, then its share of the story. */
export function partCells(
    partBoilerplate: PartBoilerplate,
    number: number,
    part: Part,
): Cell[] {
    return [
        ...partBoilerplate.front,
        ...part.cells,
        ...partBoilerplate.back,
    ].map((cell) => carried(cell, number, part.under));
}

/**
 * A cell as a part carries it.
 *
 * Two things change on the way. The title page is renumbered, because a reader
 * holding part four has to be able to see what it is part four *of*. And a
 * picture names its art relative to the file naming it, so a part — which sits a
 * folder deeper than the story — has to name it from where it now stands.
 */
function carried(cell: Cell, number: number, under: string): Cell {
    if (cell instanceof TitlePageCell) {
        const title = partTitle(cell.title, number, under);
        return new TitlePageCell(
            title,
            cell.subtitle,
            cell.author,
            cell.publisher,
            cell.date,
            cell.version,
            cell.isbn,
            cell.coverDesigner,
            cell.language,
            cell.source,
            cell.folded,
            cell.at,
            cell.uniqueId,
        );
    }
    return cell instanceof ImageCell ? fromTheFolder(cell) : cell;
}

/**
 * `cover.jpg` beside the story is `../cover.jpg` from inside `parts/`.
 *
 * The art does not move when the parts are written, so the path has to.
 *
 * A path that already climbs out of the folder is climbed one further, which is
 * right for the same reason: it was written from where the story stands.
 */
function fromTheFolder(cell: ImageCell): ImageCell {
    const src = cell.src;
    // An absolute path and a URL both already say where they are from.
    if (src === "" || src.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
        return cell;
    }
    return new ImageCell(
        `../${src}`,
        cell.fullPage,
        cell.source,
        cell.folded,
        cell.at,
        cell.uniqueId,
    );
}

/** What stands between the pieces of a part's name. */
const PART_MARKER = " — ";

/**
 * What a part is called — the story, the part of it this came from, and which
 * part of that it is.
 *
 * `Veriona — Day One — Part 3`, so a reader holding one file can see all three.
 * A piece the story does not have is left out rather than left blank: a file cut
 * where the book names no part stands under nothing it can name, and says so by
 * saying nothing.
 */
export function partTitle(title: string, number: number, under = ""): string {
    return [title, under, `Part ${number}`].filter(Boolean).join(PART_MARKER);
}

/** A story divides into `parts/` beside it. */
export const PARTS_FOLDER = "parts";

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
    const match = new RegExp(`^part_(\\d+)\\${EXTENSION}$`, "i").exec(name);
    return match === null ? null : Number(match[1]);
}
