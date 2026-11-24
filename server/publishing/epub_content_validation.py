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

    def check_cell(kind: str, cell: Cell | None, imprint: Imprint) -> tuple[str, ...]:
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
            return () if cell and cell.source.strip() else (TEXT,)
        if kind == ABOUT:
            # Every field on it is optional, so somewhere to send the reader is as
            # good as a page about them — but a page with neither is not printed.
            return () if isinstance(cell, AboutCell) and build_about_page(cell) else (TEXT,)
        return ()

    found = _first_of(cells)
    missing_content = [
        MissingContent(kind, needs)
        for kind in REQUIRED
        for needs in [check_cell(kind, cells[found[kind]] if kind in found else None, imprint)]
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
class Report:
    """What stands between this document and a book.

    Three faults, and each stops a binding. A section can be absent; a section
    can be somewhere a reader would not look for it; and a section can be there
    in name with nothing in it. The third is the one worth stating: adding a
    title page does not give a book a title, so a document whose sections are all
    present and in place is still not ready while one of them is empty.
    """

    plan: list[Slot]
    added: tuple[str, ...]
    moved: tuple[str, ...]
    wanting: tuple[MissingContent, ...]

    @property
    def ready(self) -> bool:
        return not (self.added or self.moved or self.wanting)


def report_of(document: Document) -> Report:
    """Everything the editor needs to lay this document out and mark it.

    One answer rather than three questions, because the three are asked together
    every time and a document read three times is a document that can change
    between the readings. What is wanting comes from the binding itself — these
    are the sections `read_book` could not print.
    """
    cells = document.cells
    found = _first_of(cells)
    claimed = set(found.values())
    art = _opening_art(cells)
    plan = (
        [Slot(IMAGE, at) for at in sorted(art)]
        + [Slot(kind, found.get(kind)) for kind in OPENING]
        + [
            Slot(cell.kind, at)
            for at, cell in enumerate(cells)
            if at not in claimed and at not in art
        ]
        + [Slot(kind, found.get(kind)) for kind in CLOSING]
    )
    imprint = imprint_of(document)
    missing_content = _check_missing_content(cells, imprint)
    return Report(
        plan=plan,
        added=tuple(kind for kind in REQUIRED if kind not in found),
        moved=_moved(plan, found),
        wanting=missing_content,
    )


def _opening_art(cells: list[Cell]) -> set[int]:
    art: set[int] = set()
    for at, cell in enumerate(cells):
        if cell.kind != IMAGE:
            break
        art.add(at)
    return art


def _moved(plan: list[Slot], found: dict[str, int]) -> tuple[str, ...]:
    """The sections that changed places with a cell that was already there.

    Not the sections whose index changed. Writing a blurb into the front matter
    pushes every index below it down by one, and an author told their about page
    had been moved, when it was last before and is last now, would go looking for
    a change nobody made. A section written in is not a cell that was already
    there, so writing one moves nothing; passing one is the only thing that does.
    """
    now = {slot.at: order for order, slot in enumerate(plan) if slot.at is not None}
    moved = {
        kind
        for kind, at in found.items()
        if any(
            (other < at) != (now[other] < now[at]) for other in now if other != at
        )
    }
    return tuple(kind for kind in REQUIRED if kind in moved)
