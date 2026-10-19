from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Generic, TypeVar

if TYPE_CHECKING:
    from server.storydoc.cells.about_cell import AboutCell
    from server.storydoc.cells.blurb_cell import BlurbCell
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

_Result = TypeVar("_Result")


class CellVisitor(ABC, Generic[_Result]):
    @abstractmethod
    def visit_markdown(self, cell: MarkdownCell) -> _Result: ...

    @abstractmethod
    def visit_chapter(self, cell: ChapterCell) -> _Result: ...

    @abstractmethod
    def visit_part(self, cell: PartCell) -> _Result: ...

    @abstractmethod
    def visit_divider(self, cell: DividerCell) -> _Result: ...

    @abstractmethod
    def visit_title_page(self, cell: TitlePageCell) -> _Result: ...

    @abstractmethod
    def visit_image(self, cell: ImageCell) -> _Result: ...

    @abstractmethod
    def visit_table_of_contents(self, cell: TableOfContentsCell) -> _Result: ...

    @abstractmethod
    def visit_disclaimer(self, cell: DisclaimerCell) -> _Result: ...

    @abstractmethod
    def visit_about(self, cell: AboutCell) -> _Result: ...

    @abstractmethod
    def visit_blurb(self, cell: BlurbCell) -> _Result: ...

    @abstractmethod
    def visit_note(self, cell: NoteCell) -> _Result: ...

    @abstractmethod
    def visit_recap(self, cell: RecapCell) -> _Result: ...

    @abstractmethod
    def visit_salient_concept(self, cell: SalientConceptCell) -> _Result: ...

    @abstractmethod
    def visit_plot(self, cell: PlotCell) -> _Result: ...

    @abstractmethod
    def visit_unknown(self, cell: UnknownCell) -> _Result: ...
