/**
 * A story and the layout it is published in, in one human-readable file.
 *
 * The file is `<name>.author`, and it is markdown. What makes it a story document
 * is that the markdown is cut into cells, each opened by a marker that says what
 * the cell *is*:
 *
 *     <!-- cell: chapter title="The First Night" -->
 *
 *     The lantern had gone out again.
 *
 *     <!-- cell: image src="art/cover.jpg" full-page="yes" -->
 *
 * The marker is an HTML comment, so every reader that renders markdown renders the
 * document and shows none of the scaffolding, and every editor that opens text can
 * edit it. There is no custom editor a person is obliged to use — which is the
 * whole point of not being a notebook full of escaped JSON strings.
 *
 * Two properties are load-bearing:
 *
 * **The format is open.** A cell's type is any name, and this module knows nothing
 * about most of them. An unrecognised type is carried through parse and save
 * untouched, so a document written by a newer version — or by hand — survives a
 * round trip through an older one rather than losing the cells it could not name.
 *
 * **Plain markdown is already a story document.** A file with no markers at all
 * parses as one `markdown` cell holding the lot. Nothing has to be converted, and a
 * document whose markers are all deleted is still the story.
 *
 * The one ambiguity worth naming: a line inside a cell that itself looks like a
 * marker opens a new cell. Markdown has the same bargain with fences.
 */

import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { format, parse as parsePath } from "node:path";

export const EXTENSION = ".author";

export const MARKDOWN = "markdown";
export const CHAPTER = "chapter";
export const PART = "part";
export const DIVIDER = "divider";
export const TITLE_PAGE = "title-page";
export const IMAGE = "image";
export const TABLE_OF_CONTENTS = "contents";
export const DISCLAIMER = "disclaimer";
export const ABOUT = "about";
export const BLURB = "blurb";
export const NOTE = "note";
export const RECAP = "recap";
export const SALIENT_CONCEPT = "salient-concept";
export const PLOT = "plot";

// What an attribute says when the answer to it is no.
export const NO = "no";

export const FULL_PAGE = "full-page";

const MARKER = /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
const ATTR = /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";

export const STORY_WORD_RANGES = "words";

const STORY_WORD_RANGE = /^\s*(\d+)-(\d+)\s*$/;

export const PLOT_NODES = "nodes";
export const PLOT_EDGES = "edges";

const PLOT_NODE = /^\s*([^:\s]+):(\d+)-(\d+)\s*$/;
const PLOT_EDGE = /^\s*([^:\s]+):([^>\s]+)>(\S+)\s*$/;

function splitlines(text: string): string[] {
    const lines = text.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
    if (lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
}

/**
 * One thing the document is made of, and what it says it is.
 *
 * `kind` is the cell's identity and is never inferred from its text — a chapter
 * called "Disclaimer" is still a chapter. `attrs` is whatever the kind needs
 * said about it, and is kept even when this module has no use for it.
 */
export class Cell {
    constructor(
        readonly kind: string,
        readonly source: string = "",
        readonly attrs: Readonly<Record<string, string>> = {},
        readonly at: readonly [number, number] | null = null,
    ) {}

    get title(): string {
        return this.attrs["title"] ?? "";
    }

    get uniqueId(): string {
        return this.attrs["id"] ?? "";
    }

    offsetOf(line: number, character: number): number {
        assert(this.at !== null);
        const above = splitlines(this.source).slice(0, line - this.at[0]);
        return (
            above.reduce((sum, written) => sum + written.length + 1, 0) +
            character
        );
    }

    withSource(source: string): Cell {
        return new Cell(this.kind, source, this.attrs, this.at);
    }
}

export class StoryWordRange {
    constructor(
        readonly firstWord: number,
        readonly lastWord: number,
    ) {}
}

export class SalientConceptInTheStory {
    constructor(
        readonly title: string,
        readonly abstract: string,
        readonly storyWordRanges: StoryWordRange[],
    ) {}
}

export class PlotNode {
    constructor(
        readonly nodeId: string,
        readonly storyWordRange: StoryWordRange,
    ) {}
}

export class PlotEdge {
    constructor(
        readonly edgeId: string,
        readonly fromNodeId: string,
        readonly toNodeId: string,
    ) {}
}

export class PlotInTheStory {
    constructor(
        readonly title: string,
        readonly abstract: string,
        readonly nodes: PlotNode[],
        readonly edges: PlotEdge[],
    ) {}
}

export function parse(text: string): Cell[] {
    const cells: Cell[] = [];
    let [kind, attrs, body, first]: [
        string,
        Record<string, string>,
        string[],
        number,
    ] = [MARKDOWN, {}, [], 0];
    let opened = false;

    function close(): void {
        // `dumps` strips blank lines off both ends of a cell's text, so the lines
        // it occupies are the ones between the outermost non-blank ones.
        const written = body.flatMap((line, i) => (line !== "" ? [i] : []));
        const source = body.join("\n").replace(/^\n+|\n+$/g, "");
        // A marker opens a cell, so the run of text above the first one belongs
        // to no cell and is dropped — as the editor's reader drops it.
        if (opened) {
            const at: [number, number] | null =
                written.length > 0
                    ? [first + written[0], first + written[written.length - 1]]
                    : null;
            cells.push(new Cell(kind, source, { ...attrs }, at));
        }
    }

    // Split on "\n" alone, as the editor's reader does: a form feed or a
    // U+2028 is a character the author wrote, not a line the document has.
    for (const [index, line] of text.split("\n").entries()) {
        const marker = MARKER.exec(line);
        if (!marker) {
            body.push(line);
            continue;
        }
        close();
        opened = true;
        kind = marker[1];
        attrs = readAttrs(marker[2]);
        body = [];
        first = index + 1;
    }
    close();
    return cells;
}

/** The document as text, such that `parse(dumps(cells)) == cells`. */
export function dumps(cells: Cell[]): string {
    const out: string[] = [];
    for (const cell of cells) {
        out.push(markerFor(cell));
        out.push("");
        if (cell.source) {
            out.push(cell.source);
            out.push("");
        }
    }
    return out.join("\n");
}

export function load(path: string): Cell[] {
    return parse(readFileSync(path, "utf-8"));
}

export function save(path: string, cells: Cell[]): void {
    writeFileSync(path, dumps(cells), "utf-8");
}

export function addMissing(cells: Cell[], wanted: Cell[]): Cell[] {
    const addedCells = [...cells];
    for (const cell of wanted) {
        if (!addedCells.some((addedCell) => addedCell.kind === cell.kind)) {
            addedCells.push(cell);
        }
    }
    return addedCells;
}

export function markdown(source: string): Cell {
    return new Cell(MARKDOWN, source);
}

export function chapter(title: string): Cell {
    return new Cell(CHAPTER, "", { title: title });
}

export function part(title: string): Cell {
    return new Cell(PART, "", { title: title });
}

export function divider(): Cell {
    return new Cell(DIVIDER, "");
}

export function image(src: string, fullPage: boolean = true): Cell {
    return new Cell(
        IMAGE,
        "",
        fullPage ? { src: src } : { src: src, [FULL_PAGE]: NO },
    );
}

export function isFullPage(cell: Cell): boolean {
    return (cell.attrs[FULL_PAGE] ?? "") !== NO;
}

export function tableOfContents(): Cell {
    return new Cell(TABLE_OF_CONTENTS);
}

function splitComments(
    lines: string[],
    lineIndices: number[],
): [number, number][] {
    const ranges: [number, number][] = [];
    let keptIndices: number[] = [];
    let inside = false;

    for (
        let zipped = 0;
        zipped < Math.min(lines.length, lineIndices.length);
        zipped += 1
    ) {
        const line = lines[zipped];
        const index = lineIndices[zipped];
        // A comment may open on one line and close on another, and one never
        // closed runs to the end, so a line is only known by what came above it.
        let commented = inside;
        const remainder: string[] = [];
        let rest = line;

        while (rest) {
            if (inside) {
                const close = rest.indexOf(COMMENT_CLOSE);
                if (close < 0) {
                    break;
                }
                inside = false;
                rest = rest.slice(close + COMMENT_CLOSE.length);
            } else {
                const opened = rest.indexOf(COMMENT_OPEN);
                if (opened < 0) {
                    remainder.push(rest);
                    break;
                }
                remainder.push(rest.slice(0, opened));
                commented = true;
                inside = true;
                rest = rest.slice(opened + COMMENT_OPEN.length);
            }
        }

        // Prose standing beside a comment is still prose; only a line the comment
        // left nothing of is a comment line. A blank line the author wrote is not.
        if (commented && !remainder.join("").trim()) {
            if (keptIndices.length > 0) {
                ranges.push([keptIndices[0], keptIndices[keptIndices.length - 1]]);
                keptIndices = [];
            }
        } else {
            keptIndices.push(index);
        }
    }

    if (keptIndices.length > 0) {
        ranges.push([keptIndices[0], keptIndices[keptIndices.length - 1]]);
    }

    return ranges;
}

function salientConceptInTheStory(conceptCell: Cell): SalientConceptInTheStory {
    const writtenRanges = (conceptCell.attrs[STORY_WORD_RANGES] ?? "").split(
        ",",
    );
    const storyWordRanges: StoryWordRange[] = [];
    for (const writtenRange of writtenRanges) {
        const readRange = STORY_WORD_RANGE.exec(writtenRange);
        if (readRange === null) {
            continue;
        }
        const firstWord = Number(readRange[1]);
        const lastWord = Number(readRange[2]);
        const storyWordRange = new StoryWordRange(firstWord, lastWord);
        storyWordRanges.push(storyWordRange);
    }
    const salientConcept = new SalientConceptInTheStory(
        conceptCell.title,
        conceptCell.source,
        storyWordRanges,
    );
    return salientConcept;
}

function plotInTheStory(plotCell: Cell): PlotInTheStory {
    const nodes: PlotNode[] = [];
    for (const writtenNode of (plotCell.attrs[PLOT_NODES] ?? "").split(",")) {
        const readNode = PLOT_NODE.exec(writtenNode);
        if (readNode === null) {
            continue;
        }
        const firstWord = Number(readNode[2]);
        const lastWord = Number(readNode[3]);
        const storyWordRange = new StoryWordRange(firstWord, lastWord);
        const node = new PlotNode(readNode[1], storyWordRange);
        nodes.push(node);
    }
    const edges: PlotEdge[] = [];
    for (const writtenEdge of (plotCell.attrs[PLOT_EDGES] ?? "").split(",")) {
        const readEdge = PLOT_EDGE.exec(writtenEdge);
        if (readEdge === null) {
            continue;
        }
        const edge = new PlotEdge(readEdge[1], readEdge[2], readEdge[3]);
        edges.push(edge);
    }
    const plot = new PlotInTheStory(
        plotCell.title,
        plotCell.source,
        nodes,
        edges,
    );
    return plot;
}

/** An .author document */
export class Document {
    text!: string;
    lines!: string[];
    cells!: Cell[];

    constructor(
        text: string,
        readonly path: string | null = null,
    ) {
        this.read(text);
    }

    private read(text: string): void {
        this.text = text;
        this.lines = splitlines(text);
        this.cells = parse(text);
    }

    static load(path: string): Document {
        return new Document(readFileSync(path, "utf-8"), path);
    }

    /** What the book says of itself, blank in a document that says nothing. */
    get titlePage(): Cell {
        return (
            this.cells.find((cell) => cell.kind === TITLE_PAGE) ??
            new Cell(TITLE_PAGE)
        );
    }

    get title(): string {
        return this.titlePage.title || "Anonymous";
    }

    markdownCells(): Cell[] {
        return this.cells.filter((cell) => cell.kind === MARKDOWN);
    }

    /**
     * The story itself, line by line: the prose of the markdown cells,
     * by the line of the document each is written on.
     */
    *storyLines(
        start: number = 0,
        end: number | null = null,
    ): Generator<[number, string]> {
        const last = end === null ? this.lines.length - 1 : end;
        for (const cell of this.cells) {
            if (cell.at === null || cell.kind !== MARKDOWN) {
                continue;
            }
            const [first, final] = cell.at;
            const covered = Array.from(
                { length: final + 1 - first },
                (_, offset) => first + offset,
            );
            // A cell's prose may carry the author's own notes, and those are no
            // more story than the markers around them.
            for (const [keptFirst, keptLast] of splitComments(
                covered.map((i) => this.lines[i]),
                covered,
            )) {
                for (
                    let index = Math.max(keptFirst, start);
                    index < Math.min(keptLast, last) + 1;
                    index += 1
                ) {
                    if (this.lines[index].trim()) {
                        yield [index, this.lines[index]];
                    }
                }
            }
        }
    }

    /** The raw contents of chapters - stripped of comments and any other information */
    get chapters(): [string, string][] {
        const found: [string, [number, string][]][] = [];
        for (const cell of this.cells) {
            if (cell.kind === CHAPTER) {
                found.push([cell.title || `Chapter ${found.length + 1}`, []]);
            } else if (found.length > 0 && cell.at) {
                found[found.length - 1][1].push(...this.storyLines(...cell.at));
            }
        }

        const chapterLines: [string, string][] = [];
        for (const [title, numberedLines] of found) {
            const unnumberedLines = numberedLines
                .map(([, line]) => line)
                .join("\n");
            chapterLines.push([title, unnumberedLines]);
        }

        return chapterLines;
    }

    salientConcepts(): SalientConceptInTheStory[] {
        const conceptCells = this.cells.filter(
            (cell) => cell.kind === SALIENT_CONCEPT,
        );
        const salientConcepts = conceptCells.map((conceptCell) =>
            salientConceptInTheStory(conceptCell),
        );
        return salientConcepts;
    }

    plots(): PlotInTheStory[] {
        const plotCells = this.cells.filter((cell) => cell.kind === PLOT);
        const plots = plotCells.map((plotCell) => plotInTheStory(plotCell));
        return plots;
    }

    toString(): string {
        return this.text;
    }

    /** The cell `line` falls in. */
    cellAt(line: number): Cell | null {
        for (const cell of this.cells) {
            if (cell.at && cell.at[0] <= line && line <= cell.at[1]) {
                return cell;
            }
        }
        return null;
    }

    /**
     * The lines of the cell that `line` falls in — what to correct when the
     * author names a cursor rather than a selection.
     */
    linesAt(line: number): readonly [number, number] | null {
        const cell = this.cellAt(line);
        return cell ? cell.at : null;
    }

    /** A file named after this one — `story.author` gives `story.epub`. */
    beside(suffix: string): string {
        assert(this.path !== null);
        const named = parsePath(this.path);
        return format({ dir: named.dir, name: named.name, ext: suffix });
    }

    /** Take out lines `start` to `end`, both included. */
    delete(start: number, end: number): void {
        const lines = [...this.lines];
        lines.splice(start, end + 1 - start);
        this.rewrite(lines);
    }

    /** Put `text` in as whole lines, the first landing on line `at`. */
    insert(at: number, text: string): void {
        const lines = [...this.lines];
        lines.splice(at, 0, ...splitlines(text));
        this.rewrite(lines);
    }

    private rewrite(lines: string[]): void {
        // Where the cells fall is a reading of the lines, so a document that has
        // been written in is read again rather than adjusted.
        const endsWithNewline = this.text.endsWith("\n");
        this.read(lines.join("\n") + (endsWithNewline ? "\n" : ""));
    }
}

function readAttrs(text: string): Record<string, string> {
    return Object.fromEntries(
        Array.from(text.matchAll(ATTR), ([, name, value]) => [
            name,
            unescape(value),
        ]),
    );
}

function markerFor(cell: Cell): string {
    const said = Object.entries(cell.attrs)
        .map(([name, value]) => ` ${name}="${escape(value)}"`)
        .join("");
    return `<!-- cell: ${cell.kind}${said} -->`;
}

function escape(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescape(value: string): string {
    return value.replace(/\\(.)/g, "$1");
}
