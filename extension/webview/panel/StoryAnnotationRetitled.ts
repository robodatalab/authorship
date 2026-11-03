import type { AboutCell } from "authordoc/cells/about_cell";
import type { BlurbCell } from "authordoc/cells/blurb_cell";
import type { Cell } from "authordoc/cells/cell";
import type { CellVisitor } from "authordoc/cells/cell_visitor";
import type { ChapterCell } from "authordoc/cells/chapter_cell";
import type { DisclaimerCell } from "authordoc/cells/disclaimer_cell";
import type { DividerCell } from "authordoc/cells/divider_cell";
import type { ImageCell } from "authordoc/cells/image_cell";
import type { MarkdownCell } from "authordoc/cells/markdown_cell";
import type { NoteCell } from "authordoc/cells/note_cell";
import type { PartCell } from "authordoc/cells/part_cell";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RecapCell } from "authordoc/cells/recap_cell";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { TableOfContentsCell } from "authordoc/cells/table_of_contents_cell";
import type { TitlePageCell } from "authordoc/cells/title_page_cell";
import type { UnknownCell } from "authordoc/cells/unknown_cell";
import type { Document } from "authordoc/storydoc";

export class StoryAnnotationRetitled implements CellVisitor<Cell> {
    constructor(
        private readonly title: string,
        private readonly story: Document,
    ) {}

    visitSalientConcept(cell: SalientConceptCell): SalientConceptCell {
        return new SalientConceptCell(
            this.title,
            cell.references,
            cell.source,
            cell.folded,
            cell.at,
            cell.uniqueId,
        );
    }

    visitPlot(cell: PlotCell): PlotCell {
        const retitled = new PlotCell(
            this.title,
            cell.nodes,
            cell.edges,
            cell.overview,
            cell.folded,
            cell.at,
            cell.uniqueId,
        );
        const concepts = cell.concepts(this.story);
        const retitledReferencing = retitled.withConcepts(concepts);
        return retitledReferencing;
    }

    visitMarkdown(cell: MarkdownCell): MarkdownCell {
        return cell;
    }

    visitChapter(cell: ChapterCell): ChapterCell {
        return cell;
    }

    visitPart(cell: PartCell): PartCell {
        return cell;
    }

    visitDivider(cell: DividerCell): DividerCell {
        return cell;
    }

    visitTitlePage(cell: TitlePageCell): TitlePageCell {
        return cell;
    }

    visitImage(cell: ImageCell): ImageCell {
        return cell;
    }

    visitTableOfContents(cell: TableOfContentsCell): TableOfContentsCell {
        return cell;
    }

    visitDisclaimer(cell: DisclaimerCell): DisclaimerCell {
        return cell;
    }

    visitAbout(cell: AboutCell): AboutCell {
        return cell;
    }

    visitBlurb(cell: BlurbCell): BlurbCell {
        return cell;
    }

    visitNote(cell: NoteCell): NoteCell {
        return cell;
    }

    visitRecap(cell: RecapCell): RecapCell {
        return cell;
    }

    visitUnknown(cell: UnknownCell): UnknownCell {
        return cell;
    }
}
