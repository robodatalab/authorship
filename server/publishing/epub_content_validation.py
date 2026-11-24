from __future__ import annotations

from dataclasses import dataclass

from authordoc.storydoc import Document
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB
from authordoc.cells.cell import Cell
from authordoc.cells.image_cell import IMAGE
from authordoc.cells.table_of_contents_cell import TABLE_OF_CONTENTS
from authordoc.cells.title_page_cell import TITLE_PAGE

from server.publishing.epub_content import Imprint, Wanting, imprint_of
from server.publishing.epub_xhtml_exporter import build_about_page

# What the book opens with, in the order it opens with it, and what closes it.
# The document's order is otherwise the author's, and the story between these is
# never touched — but a reader does not choose where they meet the title, the
# list of chapters or the author's own page, so these do not float.
OPENING = (TITLE_PAGE, TABLE_OF_CONTENTS, BLURB)
CLOSING = (ABOUT,)
REQUIRED = OPENING + CLOSING

# The facts a title page prints. Read off the same `Imprint` that builds the
# page, so what stops an export is exactly what would have been left off it. An
# ISBN is a fact about an edition many books never have, and is not among them.
TITLE_PAGE_FIELDS = ("title", "subtitle", "author", "publisher", "date")

# What a book is called when nobody has named it: the title the editor starts a
# page with, and the one `Document.title` falls back to when there is no page at
# all. Neither is a title.
UNNAMED = ("Untitled", "Anonymous")

# Why a section is wanting when what it lacks is not one of its fields.
TEXT = "text"


def _first_of(cells: list[Cell]) -> dict[str, int]:
    """Where each required section is, by kind.

    Only the first of a kind is claimed. A second is a page the author put where
    they put it, and this is not the place to decide they were wrong; the binding
    already names duplicate pages apart.
    """
    found: dict[str, int] = {}
    for at, cell in enumerate(cells):
        if cell.kind in REQUIRED and cell.kind not in found:
            found[cell.kind] = at
    return found


def _wanting(cells: list[Cell], imprint: Imprint) -> tuple[Wanting, ...]:
    """Which of the four have nothing in them yet.

    Asked of the same function that does the binding — `build_about_page` for the
    author's page — so what stops an export is exactly what the book would have
    gone out without, rather than a second opinion about it that can drift from
    the first.
    """
    found = _first_of(cells)
    said = [
        Wanting(kind, needs)
        for kind in REQUIRED
        for needs in [_wants(kind, cells[found[kind]] if kind in found else None, imprint)]
        if needs
    ]
    return tuple(said)


def _wants(kind: str, cell: Cell | None, imprint: Imprint) -> tuple[str, ...]:
    """What this section still needs before it can be printed.

    `cell` is None for a section that is not in the document at all, which wants
    everything its kind wants — a missing section and one nobody has filled in
    are the same fault to a reader, and are reported the same way.
    """
    if kind == TABLE_OF_CONTENTS:
        # Built from the chapters whatever the cell holds, so never a gap.
        return ()
    if kind == TITLE_PAGE:
        return _imprint_wants(imprint if cell else Imprint())
    if kind == BLURB:
        return () if cell and cell.source.strip() else (TEXT,)
    if kind == ABOUT:
        # Every field on it is optional, so somewhere to send the reader is as
        # good as a page about them — but a page with neither is not printed.
        return () if isinstance(cell, AboutCell) and build_about_page(cell) else (TEXT,)
    return ()


def _imprint_wants(imprint: Imprint) -> tuple[str, ...]:
    """The facts a title page prints that are not there yet.

    Read off the `Imprint` the page is built from, field for field, so this says
    no more and no less than what `build_title_page` would have left off.
    """
    said = {
        "title": "" if imprint.title in UNNAMED else imprint.title,
        "subtitle": imprint.subtitle,
        "author": imprint.author,
        "publisher": imprint.publisher,
        "date": imprint.date,
        "version": imprint.version,
    }
    return tuple(name for name in TITLE_PAGE_FIELDS if not said[name].strip())


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
    wanting: tuple[Wanting, ...]

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
    wanting = _wanting(cells, imprint)
    return Report(
        plan=plan,
        added=tuple(kind for kind in REQUIRED if kind not in found),
        moved=_moved(plan, found),
        wanting=wanting,
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
