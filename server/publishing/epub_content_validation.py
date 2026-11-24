from __future__ import annotations

from dataclasses import dataclass

from authordoc.storydoc import Document
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB
from authordoc.cells.cell import Cell
from authordoc.cells.table_of_contents_cell import TABLE_OF_CONTENTS
from authordoc.cells.title_page_cell import TITLE_PAGE

from server.publishing.document_to_epub_content_converter import REQUIRED, _first_of
from server.publishing.epub_content import Imprint, imprint_of
from server.publishing.epub_xhtml_exporter import build_about_page

TITLE_PAGE_FIELDS = ("title", "subtitle", "author", "publisher", "date")

UNNAMED = ("Untitled", "Anonymous")

TEXT = "text"


@dataclass(frozen=True)
class MissingContent:
    """A section the book needs that has nothing in it yet."""

    kind: str
    needs: list[str]


def _check_missing_content(cells: list[Cell], imprint: Imprint) -> list[MissingContent]:
    """Which of the four have nothing in them yet."""

    def check_cell(kind: str, cell: Cell, imprint: Imprint) -> list[str]:
        if kind == TABLE_OF_CONTENTS:
            # Built from the chapters whatever the cell holds, so never a gap.
            return []
        if kind == TITLE_PAGE:
            said = {
                "title": "" if imprint.title in UNNAMED else imprint.title,
                "subtitle": imprint.subtitle,
                "author": imprint.author,
                "publisher": imprint.publisher,
                "date": imprint.date,
                "version": imprint.version,
            }
            return [name for name in TITLE_PAGE_FIELDS if not said[name].strip()]
        if kind == BLURB:
            return [] if cell.source.strip() else [TEXT]
        if kind == ABOUT:
            # Every field on it is optional, so somewhere to send the reader is as
            # good as a page about them — but a page with neither is not printed.
            return [] if isinstance(cell, AboutCell) and build_about_page(cell) else [TEXT]
        return []

    found = _first_of(cells)
    missing_content = [
        MissingContent(kind, needs)
        for kind in REQUIRED
        if kind in found
        for needs in [check_cell(kind, cells[found[kind]], imprint)]
        if needs
    ]
    return missing_content


@dataclass(frozen=True)
class DocumentToEpubConversionReadiness:
    missing_cells: list[str]
    missing_cell_content: list[MissingContent]

    @property
    def ready_to_export(self) -> bool:
        return not (self.missing_cells or self.missing_cell_content)


def can_convert_to_epub(document: Document) -> DocumentToEpubConversionReadiness:
    cells = document.cells
    found = _first_of(cells)
    imprint = imprint_of(document)
    missing_content = _check_missing_content(cells, imprint)
    return DocumentToEpubConversionReadiness(
        missing_cells=[kind for kind in REQUIRED if kind not in found],
        missing_cell_content=missing_content,
    )
