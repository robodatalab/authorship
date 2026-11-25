from __future__ import annotations

from dataclasses import dataclass

from authordoc.storydoc import Document
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB
from authordoc.cells.cell import Cell
from authordoc.cells.table_of_contents_cell import TABLE_OF_CONTENTS
from authordoc.cells.title_page_cell import TITLE_PAGE

OPENING = (TITLE_PAGE, TABLE_OF_CONTENTS, BLURB)
CLOSING = (ABOUT,)
REQUIRED = OPENING + CLOSING

TITLE_PAGE_FIELDS = ("title", "subtitle", "author", "publisher", "date")

UNNAMED = ("Untitled", "Anonymous")

TEXT = "text"


def find_required_cell_indexes(document_cells: list[Cell]) -> dict[str, int]:
    """Where each required section is, by kind."""
    found: dict[str, int] = {}
    for at, cell in enumerate(document_cells):
        if cell.kind in REQUIRED and cell.kind not in found:
            found[cell.kind] = at
    return found


@dataclass(frozen=True)
class MissingContent:
    """A section the book needs that has nothing in it yet."""

    kind: str
    needs: list[str]


def _check_missing_content(cells: list[Cell]) -> list[MissingContent]:
    """Which of the four have nothing in them yet."""

    def check_cell(kind: str, cell: Cell) -> list[str]:
        if kind == TABLE_OF_CONTENTS:
            # Built from the chapters whatever the cell holds, so never a gap.
            return []
        if kind == TITLE_PAGE:
            said = {
                "title": "" if cell.title in UNNAMED else cell.title,  # type: ignore[attr-defined]
                "subtitle": cell.subtitle,  # type: ignore[attr-defined]
                "author": cell.author,  # type: ignore[attr-defined]
                "publisher": cell.publisher,  # type: ignore[attr-defined]
                "date": cell.date,  # type: ignore[attr-defined]
                "version": cell.version,  # type: ignore[attr-defined]
            }
            return [name for name in TITLE_PAGE_FIELDS if not said[name].strip()]
        if kind == BLURB:
            return [] if cell.source.strip() else [TEXT]
        if kind == ABOUT:
            # Every field on it is optional, so somewhere to send the reader is as
            # good as a page about them — but a page with neither is not printed.
            return [] if isinstance(cell, AboutCell) and (cell.kdp or cell.website or cell.substack or cell.source.strip()) else [TEXT]
        return []

    found = find_required_cell_indexes(cells)
    missing_content = [
        MissingContent(kind, needs)
        for kind in REQUIRED
        if kind in found
        for needs in [check_cell(kind, cells[found[kind]])]
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
    found = find_required_cell_indexes(cells)
    missing_content = _check_missing_content(cells)
    return DocumentToEpubConversionReadiness(
        missing_cells=[kind for kind in REQUIRED if kind not in found],
        missing_cell_content=missing_content,
    )
