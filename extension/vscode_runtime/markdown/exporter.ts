import {
    ABOUT,
    AuthorDocument,
    BLURB,
    CHAPTER,
    Cell,
    MARKDOWN,
    NO,
    NOTE,
    PART,
    PRINT,
    RECAP,
    TITLE_PAGE,
} from "../storydoc/model";

const LEVELS: string[] = [TITLE_PAGE, PART, CHAPTER];

const HEADING = /^(#{1,3})\s+(.*)$/;

const ASIDES: string[] = [NOTE];

const UNPUBLISHED: string[] = [NOTE, BLURB, RECAP];

/** Where the reader is sent once the story has let them go, or nothing at all. */
const AUTHOR_LINKS: [string, string][] = [
    ["kdp", "Books on Amazon"],
    ["website", "Website"],
    ["substack", "Substack"],
];

/** The heading a level of the story is written as. */
function headingFor(kind: string): string {
    return "#".repeat(LEVELS.indexOf(kind) + 1);
}

/**
 * A note as markdown holds one: inside a comment, read by whoever opens the file
 * and by no reader of the book.
 *
 * A note that says `-->` would close the comment early and spill the rest of
 * itself onto the page, so the one sequence a comment cannot hold is written the
 * way HTML writes it.
 */
function commented(source: string): string {
    return `<!--\n${source.replace(/-->/g, "--&gt;")}\n-->`;
}

/**
 * The title page as markdown can carry.
 *
 * Only the title survives as structure — markdown has one way to say "this is
 * the name of the thing" and no way at all to say "this is the publisher". The
 * rest goes out as a byline so that exporting loses none of it to the reader,
 * even though importing cannot put it back in its fields.
 */
function titlePageMarkdown(cell: Cell): string[] {
    const out = [`${headingFor(TITLE_PAGE)} ${cell.attrs.title || "Untitled"}`];
    if (cell.attrs.subtitle) {
        out.push(`*${cell.attrs.subtitle}*`);
    }
    const credits = ["author", "publisher", "date", "version", "isbn"]
        .map((name) => cell.attrs[name])
        .filter(Boolean);
    if (credits.length > 0) {
        out.push(credits.join(" · "));
    }
    return out;
}

function aboutMarkdown(cell: Cell): string[] {
    const said: string[] = [];
    if (cell.source) {
        said.push(cell.source);
    }
    const links = AUTHOR_LINKS.filter(([name]) => cell.attrs[name]).map(
        ([name, label]) => `[${label}](${cell.attrs[name]})`,
    );
    if (links.length > 0) {
        said.push(links.join(" · "));
    }
    // Nothing written and nowhere to send anyone: the page is not printed. An
    // empty "About the Author" is worse than no page at all.
    return said.length > 0
        ? [`${headingFor(CHAPTER)} About the Author`, ...said]
        : [];
}

/**
 * A plain markdown manuscript, read as a story document.
 *
 * `#` names the book, `##` a part, `###` a chapter. Each of the three carries
 * only its name, so the prose under one becomes markdown cells of its own — the
 * same split the editor keeps everywhere else.
 */
export function fromMarkdown(markdown: string): string {
    const document = AuthorDocument.fromText("");
    for (const cell of cellsFromMarkdown(markdown)) {
        document.insertAt(document.cells.length, cell);
    }
    return document.toText();
}

function cellsFromMarkdown(text: string): Cell[] {
    const cells: Cell[] = [];
    let prose: string[] = [];

    const flush = (): void => {
        const source = prose.join("\n").trim();
        if (source) {
            cells.push(new Cell(MARKDOWN, source, {}));
        }
        prose = [];
    };

    for (const line of text.split("\n")) {
        const heading = HEADING.exec(line.trim());
        if (!heading) {
            prose.push(line);
            continue;
        }
        flush();
        cells.push(
            new Cell(LEVELS[heading[1].length - 1], "", {
                title: heading[2].trim(),
            }),
        );
    }
    flush();
    return cells;
}

/**
 * The cells as a plain markdown manuscript.
 *
 * The inverse of `fromMarkdown` for the parts it can be: the story's three
 * levels go back to the headings they came from, and everything that holds
 * prose contributes its prose. What the markdown cannot carry is which cell a
 * passage came from — that is the cost of leaving the format, and the reason
 * this is an export rather than a save.
 */
export function toMarkdown(cells: Cell[]): string {
    const out: string[] = [];
    for (const cell of cells) {
        // An aside travels with the passage it was written beside, so it leaves the
        // format as what it has been all along: a comment, which every reader of
        // markdown renders as nothing at all.
        if (ASIDES.includes(cell.kind)) {
            if (cell.source) {
                out.push(commented(cell.source));
            }
            continue;
        }
        // Leaving the format loses which cell a passage came from; it must not also
        // leak what was never part of the book.
        if (UNPUBLISHED.includes(cell.kind)) {
            continue;
        }
        if (cell.kind === TITLE_PAGE) {
            out.push(...titlePageMarkdown(cell));
            continue;
        }
        if (cell.kind === PART || cell.kind === CHAPTER) {
            // A part the book does not print is not a heading of the manuscript
            // either: it marks where the files divide, and a manuscript is one file.
            if (cell.kind === PART && cell.attrs[PRINT] === NO) {
                continue;
            }
            out.push(`${headingFor(cell.kind)} ${cell.attrs.title || "Untitled"}`);
            continue;
        }
        if (cell.kind === ABOUT) {
            out.push(...aboutMarkdown(cell));
            continue;
        }
        // Any other cell that carries a name is headed by it — a disclaimer is a
        // page with a title and prose, and reads as one in markdown too. A page of
        // the book is not a level of the story, so it is headed as a chapter is:
        // markdown has no way to say "disclaimer", and it is the chapters such a
        // page stands among.
        if (cell.attrs.title) {
            out.push(`${headingFor(CHAPTER)} ${cell.attrs.title}`);
        }
        if (cell.source) {
            out.push(cell.source);
        }
    }
    return out.join("\n\n") + (out.length > 0 ? "\n" : "");
}
