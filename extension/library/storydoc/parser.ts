import type { Cell } from "./cells/cell";
import { MARKDOWN, MarkdownCell } from "./cells/markdown_cell";
import { CHAPTER, ChapterCell } from "./cells/chapter_cell";
import { PART, PartCell } from "./cells/part_cell";
import { DIVIDER, DividerCell } from "./cells/divider_cell";
import { TITLE_PAGE, TitlePageCell } from "./cells/title_page_cell";
import { IMAGE, ImageCell } from "./cells/image_cell";
import {
    TABLE_OF_CONTENTS,
    TableOfContentsCell,
} from "./cells/table_of_contents_cell";
import { DISCLAIMER, DisclaimerCell } from "./cells/disclaimer_cell";
import { ABOUT, AboutCell } from "./cells/about_cell";
import { BLURB, BlurbCell } from "./cells/blurb_cell";
import { NOTE, NoteCell } from "./cells/note_cell";
import { RECAP, RecapCell } from "./cells/recap_cell";
import {
    SALIENT_CONCEPT,
    SalientConceptCell,
    SalientConceptReference,
} from "./cells/salient_concept_cell";
import { PLOT, PlotCell, PlotEdge, PlotNode } from "./cells/plot_cell";
import { StoryWordRange } from "./cells/story_word_range";
import { UnknownCell } from "./cells/unknown_cell";
import {
    AUTHOR,
    COVER_DESIGNER,
    DATE,
    DOCUMENTS,
    FOLDED,
    FULL_PAGE,
    ISBN,
    KDP,
    LANGUAGE,
    NO,
    PLOT_EDGES,
    PLOT_NODES,
    PORTRAIT,
    PUBLISHER,
    SALIENT_CONCEPT_REFERENCES,
    SRC,
    SUBSTACK,
    SUBTITLE,
    TITLE,
    TRUE,
    UNIQUE_ID,
    VERSION,
    WEBSITE,
    MarkerAttributes,
} from "./visitors/marker_attributes";
import { attributesIn, writtenAttributeValue } from "./written_attributes";

const MARKER = /^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$/;

const SALIENT_CONCEPT_REFERENCE = /^\s*(?:([^:\s]+):)?(\d+)-(\d+)\s*$/;

const PLOT_NODE = /^\s*([^:\s]+):(\d+)-(\d+)\s*$/;
const PLOT_EDGE = /^\s*([^:\s]+):([^>\s]+)>(\S+)\s*$/;

const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";

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
        // `Document.text` strips blank lines off both ends of a cell's text, so
        // the lines it occupies are the ones between the outermost non-blank ones.
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
        attrs = attributesIn(marker[2]);
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

export function cellOfKind(kind: string): Cell {
    const uniqueId = crypto.randomUUID();
    return cellFromMarker(kind, {}, "", false, null, uniqueId);
}

function salientConceptReferencesIn(
    written: string,
): SalientConceptReference[] {
    const references: SalientConceptReference[] = [];
    for (const writtenReference of written.split(",")) {
        const readReference = SALIENT_CONCEPT_REFERENCE.exec(writtenReference);
        if (readReference === null) {
            continue;
        }
        const referenceId = readReference[1] ?? crypto.randomUUID();
        const firstWord = Number(readReference[2]);
        const lastWord = Number(readReference[3]);
        const storyWordRange = new StoryWordRange(firstWord, lastWord);
        const reference = new SalientConceptReference(
            referenceId,
            storyWordRange,
        );
        references.push(reference);
    }
    return references;
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
            const references = salientConceptReferencesIn(
                attrs[SALIENT_CONCEPT_REFERENCES] ?? "",
            );
            return new SalientConceptCell(
                attrs[TITLE] ?? "",
                references,
                source,
                folded,
                at,
                uniqueId,
            );
        }
        case PLOT: {
            const edges = plotEdgesIn(attrs[PLOT_EDGES] ?? "");
            // A plot written before plots had events keeps its nodes in its
            // marker and its overview in its body; it is written back with events.
            if (attrs[PLOT_NODES] !== undefined) {
                const nodes = plotNodesIn(attrs[PLOT_NODES]);
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
            return PlotCell.fromBody(
                attrs[TITLE] ?? "",
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

export function splitComments(
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

export function markerFor(
    cell: Cell,
    markerAttributes: MarkerAttributes,
): string {
    const attributesOfTheKind = cell.accept(markerAttributes);
    const writtenAttrs = {
        [UNIQUE_ID]: cell.uniqueId,
        ...attributesOfTheKind,
        ...(cell.folded ? { [FOLDED]: TRUE } : {}),
    };
    const said = Object.entries(writtenAttrs)
        .map(([name, value]) => ` ${name}="${writtenAttributeValue(value)}"`)
        .join("");
    return `<!-- cell: ${cell.kind}${said} -->`;
}
