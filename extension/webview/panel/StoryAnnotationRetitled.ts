import type { AboutCell } from "../../library/storydoc/cells/about_cell";
import type { BlurbCell } from "../../library/storydoc/cells/blurb_cell";
import type { Cell } from "../../library/storydoc/cells/cell";
import type { CellVisitor } from "../../library/storydoc/cells/cell_visitor";
import type { ChapterCell } from "../../library/storydoc/cells/chapter_cell";
import type { DisclaimerCell } from "../../library/storydoc/cells/disclaimer_cell";
import type { DividerCell } from "../../library/storydoc/cells/divider_cell";
import type { ImageCell } from "../../library/storydoc/cells/image_cell";
import type { MarkdownCell } from "../../library/storydoc/cells/markdown_cell";
import type { NoteCell } from "../../library/storydoc/cells/note_cell";
import type { PartCell } from "../../library/storydoc/cells/part_cell";
import { PlotCell } from "../../library/storydoc/cells/plot_cell";
import type { RecapCell } from "../../library/storydoc/cells/recap_cell";
import { SalientConceptCell } from "../../library/storydoc/cells/salient_concept_cell";
import type { TableOfContentsCell } from "../../library/storydoc/cells/table_of_contents_cell";
import type { TitlePageCell } from "../../library/storydoc/cells/title_page_cell";
import type { UnknownCell } from "../../library/storydoc/cells/unknown_cell";

export class StoryAnnotationRetitled implements CellVisitor<Cell> {
    constructor(private readonly title: string) {}

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
        return new PlotCell(
            this.title,
            cell.nodes,
            cell.edges,
            cell.source,
            cell.folded,
            cell.at,
            cell.uniqueId,
        );
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
