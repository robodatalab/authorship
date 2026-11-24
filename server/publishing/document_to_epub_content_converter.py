from __future__ import annotations

from pathlib import Path

from authordoc.storydoc import Document
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB, BlurbCell
from authordoc.cells.cell import Cell
from authordoc.cells.cell_visitor import CellVisitor
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.disclaimer_cell import DisclaimerCell
from authordoc.cells.divider_cell import DividerCell
from authordoc.cells.image_cell import IMAGE, ImageCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.note_cell import NoteCell
from authordoc.cells.part_cell import PartCell
from authordoc.cells.place_cell import PlaceCell
from authordoc.cells.plot_cell import PlotCell
from authordoc.cells.recap_cell import RecapCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.cells.table_of_contents_cell import TABLE_OF_CONTENTS, TableOfContentsCell
from authordoc.cells.title_page_cell import TITLE_PAGE, TitlePageCell
from authordoc.cells.unknown_cell import UnknownCell

from server.publishing.epub_content import Art, Chapter, EpubDocument, Imprint, Page, imprint_of, listing_of
from server.publishing.epub_xhtml_exporter import (
    build_about_page,
    build_copyright_page,
    build_cover_page,
    build_disclaimer_page,
    build_image_page,
    build_part_page,
    build_title_page,
    contents_xhtml,
)
from server.publishing.markdown_to_xhtml_converter import blocks_to_xhtml

OPENING = (TITLE_PAGE, TABLE_OF_CONTENTS, BLURB)
CLOSING = (ABOUT,)
REQUIRED = OPENING + CLOSING

# Prose the author left standing outside every chapter — a dedication, an
# epigraph, a note to the reader. Printed where it stands rather than swallowed
# by a chapter it was never part of.
LOOSE = "page_"


def read_book(document: Document) -> EpubDocument:
    """The book the document lays out, in the order of a book.

    Which cells are pages and which are the story is the kind's to say, so a
    chapter called "Disclaimer" is a chapter and a disclaimer standing between
    two chapters is still its own page.
    """
    imprint = imprint_of(document)
    root = document.path.parent if document.path else Path()
    binding = _BookBinding(imprint, root)
    cells_in_export_order = cell_export_order_of(document.cells)
    for cell in cells_in_export_order:
        cell.accept(binding)

    _name_apart(binding.documents)
    listing = listing_of(binding.documents)
    built = contents_xhtml(listing)
    for page in binding.listings:
        page.body_xhtml = built
    epub_document = EpubDocument(imprint, binding.documents, binding.art, binding.cover)
    return epub_document


def cell_export_order_of(cells: list[Cell]) -> list[Cell]:
    found = _first_of(cells)
    claimed = set(found.values())
    art = _opening_art(cells)
    opening_art = [cells[at] for at in sorted(art)]
    opening = [cells[found[kind]] for kind in OPENING if kind in found]
    story = [cell for at, cell in enumerate(cells) if at not in claimed and at not in art]
    closing = [cells[found[kind]] for kind in CLOSING if kind in found]
    cell_export_order = opening_art + opening + story + closing
    return cell_export_order


def _first_of(cells: list[Cell]) -> dict[str, int]:
    """Where each required section is, by kind."""
    found: dict[str, int] = {}
    for at, cell in enumerate(cells):
        if cell.kind in REQUIRED and cell.kind not in found:
            found[cell.kind] = at
    return found


def _opening_art(cells: list[Cell]) -> set[int]:
    art: set[int] = set()
    for at, cell in enumerate(cells):
        if cell.kind != IMAGE:
            break
        art.add(at)
    return art


class _BookBinding(CellVisitor[None]):
    def __init__(self, imprint: Imprint, root: Path) -> None:
        self.imprint = imprint
        self.root = root
        self.documents: list[Chapter | Page] = []
        self.listings: list[Page] = []
        self.art: list[Art] = []
        self.cover: Art | None = None
        self.chapters = 0
        self.parts = 0

    def visit_markdown(self, cell: MarkdownCell) -> None:
        if cell.source:
            _add_lines(self.documents, cell.source.splitlines())

    def visit_chapter(self, cell: ChapterCell) -> None:
        chapter = Chapter(self.chapters, cell.title, [])
        self.documents.append(chapter)
        self.chapters += 1

    def visit_part(self, cell: PartCell) -> None:
        part = build_part_page(self.parts, cell)
        self.documents.append(part)
        self.parts += 1

    def visit_title_page(self, cell: TitlePageCell) -> None:
        title_page = build_title_page(self.imprint)
        copyright_page = build_copyright_page(self.imprint)
        self.documents.append(title_page)
        self.documents.append(copyright_page)

    def visit_image(self, cell: ImageCell) -> None:
        source = _art_file(self.root, cell.src)
        if source is None:
            return
        picture = Art(f"art_{len(self.art):03d}", source)
        self.art.append(picture)
        if not cell.full_page:
            _add_lines(self.documents, [f"![]({picture.href})"])
        elif self.cover is None and self.chapters == 0:
            self.cover = picture
            cover_page = build_cover_page(picture, self.imprint.title)
            self.documents.append(cover_page)
        else:
            image_page = build_image_page(picture)
            self.documents.append(image_page)

    def visit_table_of_contents(self, cell: TableOfContentsCell) -> None:
        # Built here rather than taken from the cell: on the page a table of
        # contents is a list of names, in a book it is a list of links.
        listing = Page("contents", "Contents", "")
        self.listings.append(listing)
        self.documents.append(listing)

    def visit_disclaimer(self, cell: DisclaimerCell) -> None:
        page = build_disclaimer_page(cell)
        if page:
            self.documents.append(page)

    def visit_about(self, cell: AboutCell) -> None:
        portrait = _art_file(self.root, cell.portrait)
        drawn = (
            Art(f"art_{len(self.art):03d}", portrait)
            if portrait is not None
            else None
        )
        page = build_about_page(cell, drawn.href if drawn else "", self.imprint.author)
        if page:
            if drawn:
                self.art.append(drawn)
            self.documents.append(page)

    def visit_unknown(self, cell: UnknownCell) -> None:
        if cell.source:
            _add_lines(self.documents, cell.source.splitlines())

    # A cell whose text is neither a page of the book nor part of one: built from the
    # document, or kept beside it and published nowhere.
    def visit_divider(self, cell: DividerCell) -> None:
        pass

    def visit_blurb(self, cell: BlurbCell) -> None:
        pass

    def visit_note(self, cell: NoteCell) -> None:
        pass

    def visit_recap(self, cell: RecapCell) -> None:
        pass

    def visit_salient_concept(self, cell: SalientConceptCell) -> None:
        pass

    def visit_plot(self, cell: PlotCell) -> None:
        pass

    def visit_character(self, cell: CharacterCell) -> None:
        pass

    def visit_place(self, cell: PlaceCell) -> None:
        pass


def _add_lines(documents: list[Chapter | Page], lines: list[str]) -> None:
    if documents and isinstance(documents[-1], Chapter):
        documents[-1].body_lines.extend(lines)
        return
    loose = sum(1 for item in documents if item.id.startswith(LOOSE))
    written = blocks_to_xhtml(lines)
    documents.append(
        Page(f"{LOOSE}{loose:03d}", "", f'<div class="chapter">\n{written}\n</div>')
    )


def _art_file(root: Path, src: str) -> Path | None:
    """The image a cell points at, if it is really there.

    A cell naming art nobody has drawn yet is not printed, and that is the one
    case where a book goes out short of a picture rather than not at all.
    """
    return root / src if src and (root / src).is_file() else None


def _name_apart(documents: list[Chapter | Page]) -> None:
    # Nothing stops an author from adding a second disclaimer, and two manifest
    # items under one id is a book no reader will open.
    seen: dict[str, int] = {}
    for item in documents:
        seen[item.id] = seen.get(item.id, 0) + 1
        if seen[item.id] > 1:
            item.id = f"{item.id}_{seen[item.id]}"
            item.filename = f"{item.id}.xhtml"
