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

const UNIQUE_ID = "id";
export const FOLDED = "folded";
const TRUE = "true";

const TITLE = "title";
const SUBTITLE = "subtitle";
const AUTHOR = "author";
const PUBLISHER = "publisher";
const DATE = "date";
const VERSION = "version";
const ISBN = "isbn";
const COVER_DESIGNER = "cover-designer";
const LANGUAGE = "language";
const SRC = "src";
const KDP = "kdp";
const WEBSITE = "website";
const SUBSTACK = "substack";
const PORTRAIT = "portrait";
const DOCUMENTS = "documents";

const MARKER = /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;
const ATTR = /([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;

const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";

export const STORY_WORD_RANGES = "words";

const STORY_WORD_RANGE = /^\s*(\d+)-(\d+)\s*$/;

const STORY_WORD = /\S+/g;
const WORD_CHARACTER = /\w/;

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

export class StoryWordRange {
    constructor(
        readonly firstWord: number,
        readonly lastWord: number,
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

export interface CellVisitor<Result> {
    visitMarkdown(cell: MarkdownCell): Result;
    visitChapter(cell: ChapterCell): Result;
    visitPart(cell: PartCell): Result;
    visitDivider(cell: DividerCell): Result;
    visitTitlePage(cell: TitlePageCell): Result;
    visitImage(cell: ImageCell): Result;
    visitTableOfContents(cell: TableOfContentsCell): Result;
    visitDisclaimer(cell: DisclaimerCell): Result;
    visitAbout(cell: AboutCell): Result;
    visitBlurb(cell: BlurbCell): Result;
    visitNote(cell: NoteCell): Result;
    visitRecap(cell: RecapCell): Result;
    visitSalientConcept(cell: SalientConceptCell): Result;
    visitPlot(cell: PlotCell): Result;
    visitUnknown(cell: UnknownCell): Result;
}

/**
 * One thing the document is made of, and what it says it is.
 *
 * `kind` is the cell's identity and is never inferred from its text — a chapter
 * called "Disclaimer" is still a chapter.
 */
export abstract class Cell {
    abstract readonly kind: string;

    constructor(
        readonly source: string,
        readonly folded: boolean,
        readonly at: readonly [number, number] | null,
        readonly uniqueId: string,
    ) {}

    static ofKind(kind: string): Cell {
        const uniqueId = crypto.randomUUID();
        return cellFromMarker(kind, {}, "", false, null, uniqueId);
    }

    offsetOf(line: number, character: number): number {
        assert(this.at !== null);
        const above = splitlines(this.source).slice(0, line - this.at[0]);
        return (
            above.reduce((sum, written) => sum + written.length + 1, 0) +
            character
        );
    }

    abstract withSource(source: string): Cell;

    abstract withFolded(folded: boolean): Cell;

    abstract accept<Result>(visitor: CellVisitor<Result>): Result;
}

export class MarkdownCell extends Cell {
    readonly kind = MARKDOWN;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): MarkdownCell {
        return new MarkdownCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): MarkdownCell {
        return new MarkdownCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitMarkdown(this);
    }
}

export class ChapterCell extends Cell {
    readonly kind = CHAPTER;

    constructor(
        readonly title: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): ChapterCell {
        return new ChapterCell(
            this.title,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): ChapterCell {
        return new ChapterCell(
            this.title,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitChapter(this);
    }
}

export class PartCell extends Cell {
    readonly kind = PART;

    constructor(
        readonly title: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): PartCell {
        return new PartCell(
            this.title,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): PartCell {
        return new PartCell(
            this.title,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitPart(this);
    }
}

export class DividerCell extends Cell {
    readonly kind = DIVIDER;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): DividerCell {
        return new DividerCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): DividerCell {
        return new DividerCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitDivider(this);
    }
}

export class TitlePageCell extends Cell {
    readonly kind = TITLE_PAGE;

    constructor(
        readonly title: string = "",
        readonly subtitle: string = "",
        readonly author: string = "",
        readonly publisher: string = "",
        readonly date: string = "",
        readonly version: string = "",
        readonly isbn: string = "",
        readonly coverDesigner: string = "",
        readonly language: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): TitlePageCell {
        return new TitlePageCell(
            this.title,
            this.subtitle,
            this.author,
            this.publisher,
            this.date,
            this.version,
            this.isbn,
            this.coverDesigner,
            this.language,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): TitlePageCell {
        return new TitlePageCell(
            this.title,
            this.subtitle,
            this.author,
            this.publisher,
            this.date,
            this.version,
            this.isbn,
            this.coverDesigner,
            this.language,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitTitlePage(this);
    }
}

export class ImageCell extends Cell {
    readonly kind = IMAGE;

    constructor(
        readonly src: string = "",
        readonly fullPage: boolean = true,
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): ImageCell {
        return new ImageCell(
            this.src,
            this.fullPage,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): ImageCell {
        return new ImageCell(
            this.src,
            this.fullPage,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitImage(this);
    }
}

export class TableOfContentsCell extends Cell {
    readonly kind = TABLE_OF_CONTENTS;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): TableOfContentsCell {
        return new TableOfContentsCell(
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): TableOfContentsCell {
        return new TableOfContentsCell(
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitTableOfContents(this);
    }
}

export class DisclaimerCell extends Cell {
    readonly kind = DISCLAIMER;

    constructor(
        readonly title: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): DisclaimerCell {
        return new DisclaimerCell(
            this.title,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): DisclaimerCell {
        return new DisclaimerCell(
            this.title,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitDisclaimer(this);
    }
}

export class AboutCell extends Cell {
    readonly kind = ABOUT;

    constructor(
        readonly kdp: string = "",
        readonly website: string = "",
        readonly substack: string = "",
        readonly portrait: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): AboutCell {
        return new AboutCell(
            this.kdp,
            this.website,
            this.substack,
            this.portrait,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): AboutCell {
        return new AboutCell(
            this.kdp,
            this.website,
            this.substack,
            this.portrait,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitAbout(this);
    }
}

export class BlurbCell extends Cell {
    readonly kind = BLURB;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): BlurbCell {
        return new BlurbCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): BlurbCell {
        return new BlurbCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitBlurb(this);
    }
}

export class NoteCell extends Cell {
    readonly kind = NOTE;

    constructor(
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): NoteCell {
        return new NoteCell(source, this.folded, this.at, this.uniqueId);
    }

    withFolded(folded: boolean): NoteCell {
        return new NoteCell(this.source, folded, this.at, this.uniqueId);
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitNote(this);
    }
}

export class RecapCell extends Cell {
    readonly kind = RECAP;

    constructor(
        readonly documents: string = "",
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): RecapCell {
        return new RecapCell(
            this.documents,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): RecapCell {
        return new RecapCell(
            this.documents,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitRecap(this);
    }
}

export class SalientConceptCell extends Cell {
    readonly kind = SALIENT_CONCEPT;

    constructor(
        readonly title: string = "",
        readonly storyWordRanges: readonly StoryWordRange[] = [],
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): SalientConceptCell {
        return new SalientConceptCell(
            this.title,
            this.storyWordRanges,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): SalientConceptCell {
        return new SalientConceptCell(
            this.title,
            this.storyWordRanges,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitSalientConcept(this);
    }
}

export class PlotCell extends Cell {
    readonly kind = PLOT;

    constructor(
        readonly title: string = "",
        readonly nodes: readonly PlotNode[] = [],
        readonly edges: readonly PlotEdge[] = [],
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): PlotCell {
        return new PlotCell(
            this.title,
            this.nodes,
            this.edges,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): PlotCell {
        return new PlotCell(
            this.title,
            this.nodes,
            this.edges,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitPlot(this);
    }
}

export class UnknownCell extends Cell {
    constructor(
        readonly kind: string,
        readonly attrs: Readonly<Record<string, string>> = {},
        source: string = "",
        folded: boolean = false,
        at: readonly [number, number] | null = null,
        uniqueId: string = crypto.randomUUID(),
    ) {
        super(source, folded, at, uniqueId);
    }

    withSource(source: string): UnknownCell {
        return new UnknownCell(
            this.kind,
            this.attrs,
            source,
            this.folded,
            this.at,
            this.uniqueId,
        );
    }

    withFolded(folded: boolean): UnknownCell {
        return new UnknownCell(
            this.kind,
            this.attrs,
            this.source,
            folded,
            this.at,
            this.uniqueId,
        );
    }

    accept<Result>(visitor: CellVisitor<Result>): Result {
        return visitor.visitUnknown(this);
    }
}

export function parse(text: string): Cell[] {
    const cells: Cell[] = [];
    let [kind, attrs, body, first, uniqueId, folded]: [
        string,
        Record<string, string>,
        string[],
        number,
        string,
        boolean,
    ] = [MARKDOWN, {}, [], 0, "", false];
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
            const cell = cellFromMarker(
                kind,
                { ...attrs },
                source,
                folded,
                at,
                uniqueId,
            );
            cells.push(cell);
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
        uniqueId = attrs[UNIQUE_ID] || crypto.randomUUID();
        folded = attrs[FOLDED] === TRUE;
        delete attrs[UNIQUE_ID];
        delete attrs[FOLDED];
        body = [];
        first = index + 1;
    }
    close();
    return cells;
}

/** The document as text, such that `parse(dumps(cells)) == cells`. */
export function dumps(cells: readonly Cell[]): string {
    const markerAttributes = new MarkerAttributes();
    const out: string[] = [];
    for (const cell of cells) {
        const marker = markerFor(cell, markerAttributes);
        out.push(marker);
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
                ranges.push([
                    keptIndices[0],
                    keptIndices[keptIndices.length - 1],
                ]);
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

function storyWordRangesIn(written: string): StoryWordRange[] {
    const storyWordRanges: StoryWordRange[] = [];
    for (const writtenRange of written.split(",")) {
        const readRange = STORY_WORD_RANGE.exec(writtenRange);
        if (readRange === null) {
            continue;
        }
        const firstWord = Number(readRange[1]);
        const lastWord = Number(readRange[2]);
        const storyWordRange = new StoryWordRange(firstWord, lastWord);
        storyWordRanges.push(storyWordRange);
    }
    return storyWordRanges;
}

function plotNodesIn(written: string): PlotNode[] {
    const nodes: PlotNode[] = [];
    for (const writtenNode of written.split(",")) {
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
    return nodes;
}

function plotEdgesIn(written: string): PlotEdge[] {
    const edges: PlotEdge[] = [];
    for (const writtenEdge of written.split(",")) {
        const readEdge = PLOT_EDGE.exec(writtenEdge);
        if (readEdge === null) {
            continue;
        }
        const edge = new PlotEdge(readEdge[1], readEdge[2], readEdge[3]);
        edges.push(edge);
    }
    return edges;
}

function cellFromMarker(
    kind: string,
    attrs: Record<string, string>,
    source: string,
    folded: boolean,
    at: readonly [number, number] | null,
    uniqueId: string,
): Cell {
    switch (kind) {
        case MARKDOWN:
            return new MarkdownCell(source, folded, at, uniqueId);
        case CHAPTER:
            return new ChapterCell(
                attrs[TITLE] ?? "",
                source,
                folded,
                at,
                uniqueId,
            );
        case PART:
            return new PartCell(
                attrs[TITLE] ?? "",
                source,
                folded,
                at,
                uniqueId,
            );
        case DIVIDER:
            return new DividerCell(source, folded, at, uniqueId);
        case TITLE_PAGE:
            return new TitlePageCell(
                attrs[TITLE] ?? "",
                attrs[SUBTITLE] ?? "",
                attrs[AUTHOR] ?? "",
                attrs[PUBLISHER] ?? "",
                attrs[DATE] ?? "",
                attrs[VERSION] ?? "",
                attrs[ISBN] ?? "",
                attrs[COVER_DESIGNER] ?? "",
                attrs[LANGUAGE] ?? "",
                source,
                folded,
                at,
                uniqueId,
            );
        case IMAGE:
            return new ImageCell(
                attrs[SRC] ?? "",
                attrs[FULL_PAGE] !== NO,
                source,
                folded,
                at,
                uniqueId,
            );
        case TABLE_OF_CONTENTS:
            return new TableOfContentsCell(source, folded, at, uniqueId);
        case DISCLAIMER:
            return new DisclaimerCell(
                attrs[TITLE] ?? "",
                source,
                folded,
                at,
                uniqueId,
            );
        case ABOUT:
            return new AboutCell(
                attrs[KDP] ?? "",
                attrs[WEBSITE] ?? "",
                attrs[SUBSTACK] ?? "",
                attrs[PORTRAIT] ?? "",
                source,
                folded,
                at,
                uniqueId,
            );
        case BLURB:
            return new BlurbCell(source, folded, at, uniqueId);
        case NOTE:
            return new NoteCell(source, folded, at, uniqueId);
        case RECAP:
            return new RecapCell(
                attrs[DOCUMENTS] ?? "",
                source,
                folded,
                at,
                uniqueId,
            );
        case SALIENT_CONCEPT: {
            const storyWordRanges = storyWordRangesIn(
                attrs[STORY_WORD_RANGES] ?? "",
            );
            return new SalientConceptCell(
                attrs[TITLE] ?? "",
                storyWordRanges,
                source,
                folded,
                at,
                uniqueId,
            );
        }
        case PLOT: {
            const nodes = plotNodesIn(attrs[PLOT_NODES] ?? "");
            const edges = plotEdgesIn(attrs[PLOT_EDGES] ?? "");
            return new PlotCell(
                attrs[TITLE] ?? "",
                nodes,
                edges,
                source,
                folded,
                at,
                uniqueId,
            );
        }
        default:
            return new UnknownCell(kind, attrs, source, folded, at, uniqueId);
    }
}

/** An .author document */
export class Document {
    cells: Cell[];

    constructor(
        text: string,
        readonly path: string | null = null,
    ) {
        this.cells = parse(text);
    }

    get text(): string {
        return dumps(this.cells);
    }

    get lines(): string[] {
        return splitlines(this.text);
    }

    static load(path: string): Document {
        return new Document(readFileSync(path, "utf-8"), path);
    }

    /** What the book says of itself, blank in a document that says nothing. */
    get titlePage(): TitlePageCell {
        return (
            this.cells.find((cell) => cell instanceof TitlePageCell) ??
            new TitlePageCell()
        );
    }

    get title(): string {
        return this.titlePage.title || "Anonymous";
    }

    markdownCells(): MarkdownCell[] {
        return this.cells.filter((cell) => cell instanceof MarkdownCell);
    }

    cellWithId(cellId: string): Cell | undefined {
        return this.cells.find((cell) => cell.uniqueId === cellId);
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
            if (cell.at === null || !(cell instanceof MarkdownCell)) {
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

    storyText(startWordIdx: number, endWordIdx: number): string {
        const textsOfTheCells: string[] = [];
        let wordsBefore = 0;
        for (const cell of this.markdownCells()) {
            const wordsOfTheCell = Array.from(
                cell.source.matchAll(STORY_WORD),
            ).filter((run) => WORD_CHARACTER.test(run[0]));
            const firstWordIdxOfTheCell = wordsBefore;
            const covered = wordsOfTheCell.filter(
                (_, offset) =>
                    startWordIdx <= firstWordIdxOfTheCell + offset &&
                    firstWordIdxOfTheCell + offset <= endWordIdx,
            );
            wordsBefore += wordsOfTheCell.length;
            if (covered.length > 0) {
                const firstWord = covered[0];
                const lastWord = covered[covered.length - 1];
                const textOfTheCell = cell.source.slice(
                    firstWord.index,
                    lastWord.index + lastWord[0].length,
                );
                textsOfTheCells.push(textOfTheCell);
            }
        }
        const storyText = textsOfTheCells.join("\n\n");
        return storyText;
    }

    /** The raw contents of chapters - stripped of comments and any other information */
    get chapters(): [string, string][] {
        const found: [string, [number, string][]][] = [];
        for (const cell of this.cells) {
            if (cell instanceof ChapterCell) {
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

    salientConcepts(): SalientConceptCell[] {
        return this.cells.filter((cell) => cell instanceof SalientConceptCell);
    }

    plots(): PlotCell[] {
        return this.cells.filter((cell) => cell instanceof PlotCell);
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
        this.cells = parse(lines.join("\n") + (endsWithNewline ? "\n" : ""));
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

function withoutTheOnesNothingIsSaidAbout(
    attributes: Record<string, string>,
): Record<string, string> {
    const said = Object.entries(attributes).filter(([, value]) => value !== "");
    return Object.fromEntries(said);
}

function writtenStoryWordRanges(
    storyWordRanges: readonly StoryWordRange[],
): string {
    return storyWordRanges
        .map((range) => `${range.firstWord}-${range.lastWord}`)
        .join(", ");
}

function writtenPlotNodes(nodes: readonly PlotNode[]): string {
    return nodes
        .map(
            (node) =>
                `${node.nodeId}:${node.storyWordRange.firstWord}-${node.storyWordRange.lastWord}`,
        )
        .join(", ");
}

function writtenPlotEdges(edges: readonly PlotEdge[]): string {
    return edges
        .map((edge) => `${edge.edgeId}:${edge.fromNodeId}>${edge.toNodeId}`)
        .join(", ");
}

class MarkerAttributes implements CellVisitor<Record<string, string>> {
    visitMarkdown(): Record<string, string> {
        return {};
    }

    visitChapter(cell: ChapterCell): Record<string, string> {
        return withoutTheOnesNothingIsSaidAbout({ [TITLE]: cell.title });
    }

    visitPart(cell: PartCell): Record<string, string> {
        return withoutTheOnesNothingIsSaidAbout({ [TITLE]: cell.title });
    }

    visitDivider(): Record<string, string> {
        return {};
    }

    visitTitlePage(cell: TitlePageCell): Record<string, string> {
        return withoutTheOnesNothingIsSaidAbout({
            [TITLE]: cell.title,
            [SUBTITLE]: cell.subtitle,
            [AUTHOR]: cell.author,
            [PUBLISHER]: cell.publisher,
            [DATE]: cell.date,
            [VERSION]: cell.version,
            [ISBN]: cell.isbn,
            [COVER_DESIGNER]: cell.coverDesigner,
            [LANGUAGE]: cell.language,
        });
    }

    visitImage(cell: ImageCell): Record<string, string> {
        return withoutTheOnesNothingIsSaidAbout({
            [SRC]: cell.src,
            [FULL_PAGE]: cell.fullPage ? "" : NO,
        });
    }

    visitTableOfContents(): Record<string, string> {
        return {};
    }

    visitDisclaimer(cell: DisclaimerCell): Record<string, string> {
        return withoutTheOnesNothingIsSaidAbout({ [TITLE]: cell.title });
    }

    visitAbout(cell: AboutCell): Record<string, string> {
        return withoutTheOnesNothingIsSaidAbout({
            [KDP]: cell.kdp,
            [WEBSITE]: cell.website,
            [SUBSTACK]: cell.substack,
            [PORTRAIT]: cell.portrait,
        });
    }

    visitBlurb(): Record<string, string> {
        return {};
    }

    visitNote(): Record<string, string> {
        return {};
    }

    visitRecap(cell: RecapCell): Record<string, string> {
        return withoutTheOnesNothingIsSaidAbout({
            [DOCUMENTS]: cell.documents,
        });
    }

    visitSalientConcept(cell: SalientConceptCell): Record<string, string> {
        const storyWordRanges = writtenStoryWordRanges(cell.storyWordRanges);
        return withoutTheOnesNothingIsSaidAbout({
            [TITLE]: cell.title,
            [STORY_WORD_RANGES]: storyWordRanges,
        });
    }

    visitPlot(cell: PlotCell): Record<string, string> {
        const nodes = writtenPlotNodes(cell.nodes);
        const edges = writtenPlotEdges(cell.edges);
        return withoutTheOnesNothingIsSaidAbout({
            [TITLE]: cell.title,
            [PLOT_NODES]: nodes,
            [PLOT_EDGES]: edges,
        });
    }

    visitUnknown(cell: UnknownCell): Record<string, string> {
        return { ...cell.attrs };
    }
}

function markerFor(cell: Cell, markerAttributes: MarkerAttributes): string {
    const attributesOfTheKind = cell.accept(markerAttributes);
    const writtenAttrs = {
        [UNIQUE_ID]: cell.uniqueId,
        ...attributesOfTheKind,
        ...(cell.folded ? { [FOLDED]: TRUE } : {}),
    };
    const said = Object.entries(writtenAttrs)
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
