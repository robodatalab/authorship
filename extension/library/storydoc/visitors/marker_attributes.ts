import type { AboutCell } from "../cells/about_cell";
import type { CellVisitor } from "../cells/cell_visitor";
import type { ChapterCell } from "../cells/chapter_cell";
import type { DisclaimerCell } from "../cells/disclaimer_cell";
import type { ImageCell } from "../cells/image_cell";
import type { PartCell } from "../cells/part_cell";
import type { PlotCell, PlotEdge } from "../cells/plot_cell";
import type { RecapCell } from "../cells/recap_cell";
import type {
    SalientConceptCell,
    SalientConceptReference,
} from "../cells/salient_concept_cell";
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

export const SALIENT_CONCEPT_REFERENCES = "words";

export const PLOT_NODES = "nodes";
export const PLOT_EDGES = "edges";

function withoutTheOnesNothingIsSaidAbout(
    attributes: Record<string, string>,
): Record<string, string> {
    const said = Object.entries(attributes).filter(([, value]) => value !== "");
    return Object.fromEntries(said);
}

function writtenSalientConceptReferences(
    references: readonly SalientConceptReference[],
): string {
    return references
        .map(
            (reference) =>
                `${reference.referenceId}:${reference.storyWordRange.firstWord}-${reference.storyWordRange.lastWord}`,
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
        const references = writtenSalientConceptReferences(cell.references);
        return withoutTheOnesNothingIsSaidAbout({
            [TITLE]: cell.title,
            [SALIENT_CONCEPT_REFERENCES]: references,
        });
    }

    // A plot's events are its body; its marker says only its title and edges.
    visitPlot(cell: PlotCell): Record<string, string> {
        const edges = writtenPlotEdges(cell.edges);
        return withoutTheOnesNothingIsSaidAbout({
            [TITLE]: cell.title,
            [PLOT_EDGES]: edges,
        });
    }

    visitUnknown(cell: UnknownCell): Record<string, string> {
        return { ...cell.attrs };
    }
}
