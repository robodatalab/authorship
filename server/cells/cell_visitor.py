from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Generic, TypeVar

if TYPE_CHECKING:
    from server.cells.about_cell import AboutCell
    from server.cells.blurb_cell import BlurbCell
    from server.cells.chapter_cell import ChapterCell
    from server.cells.disclaimer_cell import DisclaimerCell
    from server.cells.divider_cell import DividerCell
    from server.cells.image_cell import ImageCell
    from server.cells.markdown_cell import MarkdownCell
    from server.cells.note_cell import NoteCell
    from server.cells.part_cell import PartCell
    from server.cells.plot_cell import PlotCell
    from server.cells.recap_cell import RecapCell
    from server.cells.salient_concept_cell import SalientConceptCell
    from server.cells.table_of_contents_cell import TableOfContentsCell
    from server.cells.title_page_cell import TitlePageCell
    from server.cells.unknown_cell import UnknownCell

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
