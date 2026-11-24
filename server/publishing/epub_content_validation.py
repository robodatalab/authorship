from __future__ import annotations

from dataclasses import dataclass

from authordoc.storydoc import Document
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB
from authordoc.cells.cell import Cell
from authordoc.cells.image_cell import IMAGE
from authordoc.cells.table_of_contents_cell import TABLE_OF_CONTENTS
from authordoc.cells.title_page_cell import TITLE_PAGE

from server.publishing.epub_content import Imprint, imprint_of
from server.publishing.epub_xhtml_exporter import build_about_page

OPENING = (TITLE_PAGE, TABLE_OF_CONTENTS, BLURB)
CLOSING = (ABOUT,)
REQUIRED = OPENING + CLOSING

TITLE_PAGE_FIELDS = ("title", "subtitle", "author", "publisher", "date")

UNNAMED = ("Untitled", "Anonymous")

TEXT = "text"


@dataclass(frozen=True)
class MissingContent:
    """A section the book needs that has nothing in it yet.

    `needs` are field names for a section whose facts are typed into boxes, and
    `art` or `text` for one that wants an image or prose. Names rather than
    sentences: what a field is called in front of the author is the editor's to
    say, and it already says it everywhere else.
    """

    kind: str
    needs: tuple[str, ...]


def _first_of(cells: list[Cell]) -> dict[str, int]:
    """Where each required section is, by kind."""
    found: dict[str, int] = {}
    for at, cell in enumerate(cells):
        if cell.kind in REQUIRED and cell.kind not in found:
            found[cell.kind] = at
    return found


def _check_missing_content(cells: list[Cell], imprint: Imprint) -> tuple[MissingContent, ...]:
    """Which of the four have nothing in them yet."""

    def check_cell(kind: str, cell: Cell, imprint: Imprint) -> tuple[str, ...]:
        if kind == TABLE_OF_CONTENTS:
            # Built from the chapters whatever the cell holds, so never a gap.
            return ()
        if kind == TITLE_PAGE:
            said = {
                "title": "" if imprint.title in UNNAMED else imprint.title,
                "subtitle": imprint.subtitle,
                "author": imprint.author,
                "publisher": imprint.publisher,
                "date": imprint.date,
                "version": imprint.version,
            }
            return tuple(name for name in TITLE_PAGE_FIELDS if not said[name].strip())
        if kind == BLURB:
            return () if cell.source.strip() else (TEXT,)
        if kind == ABOUT:
            # Every field on it is optional, so somewhere to send the reader is as
            # good as a page about them — but a page with neither is not printed.
            return () if isinstance(cell, AboutCell) and build_about_page(cell) else (TEXT,)
        return ()

    found = _first_of(cells)
    missing_content = [
        MissingContent(kind, needs)
        for kind in REQUIRED
        if kind in found
        for needs in [check_cell(kind, cells[found[kind]], imprint)]
        if needs
    ]
    return tuple(missing_content)


@dataclass(frozen=True)
class Slot:
    """One place in the laid-out document, and where its cell comes from.

    `at` is the cell's index in the document as it stands, or None for a section
    that has to be written in. The editor rebuilds the document from these: it
    carries the author's own cells across by index and starts a blank for the
    rest, so nothing it writes is a guess about what a section should say.
    """

    kind: str
    at: int | None


@dataclass(frozen=True)
class DocumentToEpubConversionReadiness:
    """What stands between this document and a book.

    Two faults, and each stops a binding. A section can be absent; and a section
    can be there in name with nothing in it. The second is the one worth stating:
    adding a title page does not give a book a title, so a document whose sections
    are all present is still not ready while one of them is empty.
    """

    cell_export_order: list[Slot]
    missing_cells: list[str]
    missing_cell_content: tuple[MissingContent, ...]

    @property
    def ready_to_export(self) -> bool:
        return not (self.missing_cells or self.missing_cell_content)


def can_convert_to_epub(document: Document) -> DocumentToEpubConversionReadiness:
    """Everything the editor needs to lay this document out and mark it.

    One answer rather than three questions, because the three are asked together
    every time and a document read three times is a document that can change
    between the readings. What is wanting comes from the binding itself — these
    are the sections `read_book` could not print.
    """
    cells = document.cells
    found = _first_of(cells)
    cell_export_order = cell_export_order_of(cells)
    imprint = imprint_of(document)
    missing_content = _check_missing_content(cells, imprint)
    return DocumentToEpubConversionReadiness(
        cell_export_order=cell_export_order,
        missing_cells=[kind for kind in REQUIRED if kind not in found],
        missing_cell_content=missing_content,
    )


def cell_export_order_of(cells: list[Cell]) -> list[Slot]:
    found = _first_of(cells)
    claimed = set(found.values())
    art = _opening_art(cells)
    cell_export_order = (
        [Slot(IMAGE, at) for at in sorted(art)]
        + [Slot(kind, found.get(kind)) for kind in OPENING]
        + [
            Slot(cell.kind, at)
            for at, cell in enumerate(cells)
            if at not in claimed and at not in art
        ]
        + [Slot(kind, found.get(kind)) for kind in CLOSING]
    )
    return cell_export_order


def _opening_art(cells: list[Cell]) -> set[int]:
    art: set[int] = set()
    for at, cell in enumerate(cells):
        if cell.kind != IMAGE:
            break
        art.add(at)
    return art
