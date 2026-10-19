import type { AboutCell } from "../cells/about_cell";
import type { BlurbCell } from "../cells/blurb_cell";
import type { CellVisitor } from "../cells/cell_visitor";
import type { ChapterCell } from "../cells/chapter_cell";
import type { DisclaimerCell } from "../cells/disclaimer_cell";
import type { DividerCell } from "../cells/divider_cell";
import type { ImageCell } from "../cells/image_cell";
import type { MarkdownCell } from "../cells/markdown_cell";
import type { NoteCell } from "../cells/note_cell";
import type { PartCell } from "../cells/part_cell";
import type { PlotCell } from "../cells/plot_cell";
import type { PlotEdge } from "../cells/plot_edge";
import type { PlotNode } from "../cells/plot_node";
import type { RecapCell } from "../cells/recap_cell";
import type { SalientConceptCell } from "../cells/salient_concept_cell";
import type { StoryWordRange } from "../cells/story_word_range";
import type { TableOfContentsCell } from "../cells/table_of_contents_cell";
import type { TitlePageCell } from "../cells/title_page_cell";
import type { UnknownCell } from "../cells/unknown_cell";

// What an attribute says when the answer to it is no.
export const NO = "no";

export const FULL_PAGE = "full-page";

export const UNIQUE_ID = "id";
export const FOLDED = "folded";
export const TRUE = "true";

export const TITLE = "title";
export const SUBTITLE = "subtitle";
export const AUTHOR = "author";
export const PUBLISHER = "publisher";
export const DATE = "date";
export const VERSION = "version";
export const ISBN = "isbn";
export const COVER_DESIGNER = "cover-designer";
export const LANGUAGE = "language";
export const SRC = "src";
export const KDP = "kdp";
export const WEBSITE = "website";
export const SUBSTACK = "substack";
export const PORTRAIT = "portrait";
export const DOCUMENTS = "documents";

export const STORY_WORD_RANGES = "words";

export const PLOT_NODES = "nodes";
export const PLOT_EDGES = "edges";

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

export class MarkerAttributes implements CellVisitor<Record<string, string>> {
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
