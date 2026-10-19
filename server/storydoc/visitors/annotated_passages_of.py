from __future__ import annotations

from server.storydoc.cells.about_cell import AboutCell
from server.storydoc.cells.blurb_cell import BlurbCell
from server.storydoc.cells.cell_visitor import CellVisitor
from server.storydoc.cells.chapter_cell import ChapterCell
from server.storydoc.cells.disclaimer_cell import DisclaimerCell
from server.storydoc.cells.divider_cell import DividerCell
from server.storydoc.cells.image_cell import ImageCell
from server.storydoc.cells.markdown_cell import MarkdownCell
from server.storydoc.cells.note_cell import NoteCell
from server.storydoc.cells.part_cell import PartCell
from server.storydoc.cells.plot_cell import PlotCell
from server.storydoc.cells.recap_cell import RecapCell
from server.storydoc.cells.salient_concept_cell import SalientConceptCell
from server.storydoc.cells.table_of_contents_cell import TableOfContentsCell
from server.storydoc.cells.title_page_cell import TitlePageCell
from server.storydoc.cells.unknown_cell import UnknownCell
from server.storydoc.visitors.annotated_passages import AnnotatedPassages


class AnnotatedPassagesOf(CellVisitor["AnnotatedPassages | None"]):
    def visit_salient_concept(self, cell: SalientConceptCell) -> AnnotatedPassages:
        return AnnotatedPassages(cell.title, cell.story_word_ranges)

    def visit_plot(self, cell: PlotCell) -> AnnotatedPassages:
        story_word_ranges = [node.story_word_range for node in cell.nodes]
        return AnnotatedPassages(cell.title, story_word_ranges)

    def visit_markdown(self, cell: MarkdownCell) -> None:
        return None

    def visit_chapter(self, cell: ChapterCell) -> None:
        return None

    def visit_part(self, cell: PartCell) -> None:
        return None

    def visit_divider(self, cell: DividerCell) -> None:
        return None

    def visit_title_page(self, cell: TitlePageCell) -> None:
        return None

    def visit_image(self, cell: ImageCell) -> None:
        return None

    def visit_table_of_contents(self, cell: TableOfContentsCell) -> None:
        return None

    def visit_disclaimer(self, cell: DisclaimerCell) -> None:
        return None

    def visit_about(self, cell: AboutCell) -> None:
        return None

    def visit_blurb(self, cell: BlurbCell) -> None:
        return None

    def visit_note(self, cell: NoteCell) -> None:
        return None

    def visit_recap(self, cell: RecapCell) -> None:
        return None

    def visit_unknown(self, cell: UnknownCell) -> None:
        return None
