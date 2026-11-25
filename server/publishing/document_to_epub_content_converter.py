from __future__ import annotations

from pathlib import Path

from authordoc import cells
from authordoc.storydoc import Document
from authordoc.story_sections import CellsInASection, cells_by_section

from server.publishing import epub_items

OPENING = (cells.TITLE_PAGE, cells.TABLE_OF_CONTENTS, cells.BLURB)
CLOSING = (cells.ABOUT,)
REQUIRED = OPENING + CLOSING


def read_book(document: Document) -> epub_items.EpubDocument:
    """The book the document lays out, in the order of a book.

    Which cells are pages and which are the story is the kind's to say, so a
    chapter called "Disclaimer" is a chapter and a disclaimer standing between
    two chapters is still its own page.
    """
    metadata = epub_items.EpubMetadata.create(document)
    root = document.path.parent if document.path else Path()
    binding = _BookBinding(metadata, root)
    cells_in_export_order = cell_export_order_of(document.cells)
    for cell in cells_in_export_order:
        cell.accept(binding)

    _name_apart(binding.documents)
    sections = cells_by_section(cells_in_export_order)
    table_of_contents = _build_table_of_contents(sections, binding.page_of_cell)
    for contents_page in binding.contents_pages:
        contents_page.table_of_contents = table_of_contents
    navigation_document = epub_items.EpubNavigationDocument(metadata, table_of_contents)
    ncx = epub_items.EpubNcx(metadata, table_of_contents)
    epub_document = epub_items.EpubDocument(
        [
            epub_items.EpubMimetypeFile(),
            epub_items.EpubContainerFile(),
            metadata,
            epub_items.EpubStylesheet(),
            navigation_document,
            ncx,
            *binding.art,
            *binding.documents,
        ]
    )
    return epub_document


def _build_table_of_contents(
    sections: list[CellsInASection], page_of_cell: dict[str, epub_items.EpubPage]
) -> list[epub_items.Listing]:
    table_of_contents: list[epub_items.Listing] = []
    for section in sections:
        if section.cell.kind == cells.CHAPTER:
            chapter_page = page_of_cell[section.cell.unique_id]
            chapter_entry = epub_items.Listing(chapter_page, [])
            table_of_contents.append(chapter_entry)
        elif section.cell.kind == cells.PART:
            part_page = page_of_cell[section.cell.unique_id]
            chapter_entries = _build_table_of_contents(section.within, page_of_cell)
            part_entry = epub_items.Listing(part_page, chapter_entries)
            table_of_contents.append(part_entry)
    return table_of_contents


def cell_export_order_of(document_cells: list[cells.Cell]) -> list[cells.Cell]:
    found = _first_of(document_cells)
    claimed = set(found.values())
    art = _opening_art(document_cells)
    opening_art = [document_cells[at] for at in sorted(art)]
    opening = [document_cells[found[kind]] for kind in OPENING if kind in found]
    story = [cell for at, cell in enumerate(document_cells) if at not in claimed and at not in art]
    closing = [document_cells[found[kind]] for kind in CLOSING if kind in found]
    cell_export_order = opening_art + opening + story + closing
    return cell_export_order


def _first_of(document_cells: list[cells.Cell]) -> dict[str, int]:
    """Where each required section is, by kind."""
    found: dict[str, int] = {}
    for at, cell in enumerate(document_cells):
        if cell.kind in REQUIRED and cell.kind not in found:
            found[cell.kind] = at
    return found


def _opening_art(document_cells: list[cells.Cell]) -> set[int]:
    art: set[int] = set()
    for at, cell in enumerate(document_cells):
        if cell.kind != cells.IMAGE:
            break
        art.add(at)
    return art


class _BookBinding(cells.CellVisitor[None]):
    def __init__(self, metadata: epub_items.EpubMetadata, root: Path) -> None:
        self.metadata = metadata
        self.root = root
        self.documents: list[epub_items.EpubPage] = []
        self.contents_pages: list[epub_items.EpubContentsPage] = []
        self.art: list[epub_items.EpubImage] = []
        self.cover: epub_items.EpubCoverImage | None = None
        self.page_of_cell: dict[str, epub_items.EpubPage] = {}
        self.chapters = 0
        self.parts = 0

    def visit_markdown(self, cell: cells.MarkdownCell) -> None:
        if cell.source:
            _add_lines(self.documents, cell.source.splitlines(), self.metadata)

    def visit_chapter(self, cell: cells.ChapterCell) -> None:
        chapter = epub_items.EpubChapter.create(self.chapters, cell.title, self.metadata)
        self.documents.append(chapter)
        self.page_of_cell[cell.unique_id] = chapter
        self.chapters += 1

    def visit_part(self, cell: cells.PartCell) -> None:
        part = epub_items.EpubPartPage.create(self.parts, cell.title, self.metadata)
        self.documents.append(part)
        self.page_of_cell[cell.unique_id] = part
        self.parts += 1

    def visit_title_page(self, cell: cells.TitlePageCell) -> None:
        title_page = epub_items.EpubTitlePage.create(self.metadata)
        copyright_page = epub_items.EpubCopyrightPage.create(self.metadata)
        self.documents.append(title_page)
        self.documents.append(copyright_page)

    def visit_image(self, cell: cells.ImageCell) -> None:
        source = _art_file(self.root, cell.src)
        if source is None:
            return
        image_id = f"art_{len(self.art):03d}"
        if cell.full_page and self.cover is None and self.chapters == 0:
            cover = epub_items.EpubCoverImage(image_id, source)
            self.art.append(cover)
            self.cover = cover
            cover_page = epub_items.EpubCoverPage.create(cover, self.metadata)
            self.documents.append(cover_page)
            return
        picture = epub_items.EpubImage(image_id, source)
        self.art.append(picture)
        if not cell.full_page:
            _add_lines(self.documents, [f"![]({picture.href})"], self.metadata)
        else:
            image_page = epub_items.EpubImagePage.create(picture, self.metadata)
            self.documents.append(image_page)

    def visit_table_of_contents(self, cell: cells.TableOfContentsCell) -> None:
        # Built here rather than taken from the cell: on the page a table of
        # contents is a list of names, in a book it is a list of links.
        contents_page = epub_items.EpubContentsPage.create(self.metadata)
        self.contents_pages.append(contents_page)
        self.documents.append(contents_page)

    def visit_disclaimer(self, cell: cells.DisclaimerCell) -> None:
        if not cell.source.strip():
            return
        disclaimer_page = epub_items.EpubDisclaimerPage.create(cell.title, cell.source, self.metadata)
        self.documents.append(disclaimer_page)

    def visit_about(self, cell: cells.AboutCell) -> None:
        has_links = cell.kdp or cell.website or cell.substack
        if not has_links and not cell.source.strip():
            return
        portrait = _art_file(self.root, cell.portrait)
        drawn = (
            epub_items.EpubImage(f"art_{len(self.art):03d}", portrait)
            if portrait is not None
            else None
        )
        if drawn:
            self.art.append(drawn)
        about_page = epub_items.EpubAboutPage.create(cell, drawn.href if drawn else "", self.metadata)
        self.documents.append(about_page)

    def visit_unknown(self, cell: cells.UnknownCell) -> None:
        if cell.source:
            _add_lines(self.documents, cell.source.splitlines(), self.metadata)

    # A cell whose text is neither a page of the book nor part of one: built from the
    # document, or kept beside it and published nowhere.
    def visit_divider(self, cell: cells.DividerCell) -> None:
        pass

    def visit_blurb(self, cell: cells.BlurbCell) -> None:
        pass

    def visit_note(self, cell: cells.NoteCell) -> None:
        pass

    def visit_recap(self, cell: cells.RecapCell) -> None:
        pass

    def visit_salient_concept(self, cell: cells.SalientConceptCell) -> None:
        pass

    def visit_plot(self, cell: cells.PlotCell) -> None:
        pass

    def visit_character(self, cell: cells.CharacterCell) -> None:
        pass

    def visit_place(self, cell: cells.PlaceCell) -> None:
        pass


def _add_lines(
    documents: list[epub_items.EpubPage], lines: list[str], metadata: epub_items.EpubMetadata
) -> None:
    if documents and isinstance(documents[-1], epub_items.EpubChapter):
        documents[-1].body_lines.extend(lines)
        return
    prose_pages = sum(1 for item in documents if isinstance(item, epub_items.EpubProsePage))
    prose_page = epub_items.EpubProsePage.create(prose_pages, lines, metadata)
    documents.append(prose_page)


def _art_file(root: Path, src: str) -> Path | None:
    """The image a cell points at, if it is really there.

    A cell naming art nobody has drawn yet is not printed, and that is the one
    case where a book goes out short of a picture rather than not at all.
    """
    return root / src if src and (root / src).is_file() else None


def _name_apart(documents: list[epub_items.EpubPage]) -> None:
    # Nothing stops an author from adding a second disclaimer, and two manifest
    # items under one id is a book no reader will open.
    seen: dict[str, int] = {}
    for item in documents:
        seen[item.id] = seen.get(item.id, 0) + 1
        if seen[item.id] > 1:
            item.id = f"{item.id}_{seen[item.id]}"
            item.filename = f"{item.id}.xhtml"
