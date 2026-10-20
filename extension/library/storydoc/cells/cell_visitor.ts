import type { AboutCell } from "./about_cell";
import type { BlurbCell } from "./blurb_cell";
import type { ChapterCell } from "./chapter_cell";
import type { DisclaimerCell } from "./disclaimer_cell";
import type { DividerCell } from "./divider_cell";
import type { ImageCell } from "./image_cell";
import type { MarkdownCell } from "./markdown_cell";
import type { NoteCell } from "./note_cell";
import type { PartCell } from "./part_cell";
import type { PlotCell } from "./plot_cell";
import type { RecapCell } from "./recap_cell";
import type { SalientConceptCell } from "./salient_concept_cell";
import type { TableOfContentsCell } from "./table_of_contents_cell";
import type { TitlePageCell } from "./title_page_cell";
import type { UnknownCell } from "./unknown_cell";

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
