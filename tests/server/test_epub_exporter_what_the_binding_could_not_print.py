"""Tests for binding a story document into an EPUB.

The documents are built through `Document.save` rather than written out by hand,
so a change to how the format is written cannot leave these testing a layout that
no longer exists. Each one is built where a real book is built — in a directory,
from a file — because the cover is a path the document points at.
"""

import tempfile
import unittest
from pathlib import Path

from server.publishing.epub_content_validation import TEXT, can_convert_to_epub
from authordoc import storydoc
from authordoc.storydoc import Document
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB, BlurbCell
from authordoc.cells.cell import Cell
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.disclaimer_cell import DISCLAIMER, DisclaimerCell
from authordoc.cells.table_of_contents_cell import (
    TABLE_OF_CONTENTS,
    TableOfContentsCell,
)
from authordoc.cells.title_page_cell import TITLE_PAGE, TitlePageCell


def placed(root: Path, *cells: Cell, name: str = "story") -> Document:
    """A document on disk, so the cover art it points at can be looked for."""
    path = root / f"{name}{storydoc.EXTENSION}"
    Document.from_cells(list(cells), path).save()
    return Document.load(path)


def filled_title_page(**over: str) -> Cell:
    said = {
        "title": "Book",
        "subtitle": "A Story",
        "author": "A. Writer",
        "publisher": "A Press",
        "date": "2026-09-02",
    }
    said.update(over)
    return TitlePageCell(**said)


class WhatTheBindingCouldNotPrint(unittest.TestCase):
    """The judgements `read_book` already makes, now that it keeps them.

    Every one of these was decided while binding and thrown away: a book went out
    short of a section and said nothing about it.
    """

    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def missing_cell_content(self, *cells: Cell) -> dict[str, list[str]]:
        found = can_convert_to_epub(placed(self.root, *cells))
        return {item.kind: item.needs for item in found.missing_cell_content}

    def test_a_title_page_nobody_filled_in(self) -> None:
        said = self.missing_cell_content(TitlePageCell(title="Untitled"))
        self.assertEqual(
            said[TITLE_PAGE],
            ["title", "subtitle", "author", "publisher", "date"],
        )

    def test_it_names_only_the_fields_that_are_empty(self) -> None:
        said = self.missing_cell_content(filled_title_page(author="", date="   "))
        self.assertEqual(said[TITLE_PAGE], ["author", "date"])

    def test_a_version_is_never_wanted(self) -> None:
        # A fact about an edition, like an ISBN, not a thing a book waits for.
        said = self.missing_cell_content(filled_title_page(version=""))
        self.assertNotIn(TITLE_PAGE, said)

    def test_an_isbn_is_never_wanted(self) -> None:
        # Many editions have none, so it is not a fact a book waits for.
        said = self.missing_cell_content(filled_title_page())
        self.assertNotIn(TITLE_PAGE, said)

    def test_an_about_page_with_nothing_on_it(self) -> None:
        # `build_about_page` already answers None here.
        said = self.missing_cell_content(AboutCell())
        self.assertEqual(said[ABOUT], [TEXT])

    def test_an_about_page_with_only_a_link_is_written(self) -> None:
        said = self.missing_cell_content(AboutCell(website="https://x.com"))
        self.assertNotIn(ABOUT, said)

    def test_an_empty_blurb(self) -> None:
        said = self.missing_cell_content(BlurbCell())
        self.assertEqual(said[BLURB], [TEXT])

    def test_the_table_of_contents_is_never_wanting(self) -> None:
        # It is built from the chapters whatever the cell holds.
        said = self.missing_cell_content(TableOfContentsCell())
        self.assertNotIn(TABLE_OF_CONTENTS, said)

    def test_a_section_that_is_not_there_has_no_missing_content(self) -> None:
        said = self.missing_cell_content(ChapterCell("One"))
        self.assertEqual(said, {})

    def test_a_disclaimer_is_not_a_section_the_book_requires(self) -> None:
        said = self.missing_cell_content(DisclaimerCell(), ChapterCell("One"))
        self.assertNotIn(DISCLAIMER, said)


if __name__ == "__main__":
    unittest.main()
