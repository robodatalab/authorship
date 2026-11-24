"""Tests for binding a story document into an EPUB.

The documents are built through `Document.save` rather than written out by hand,
so a change to how the format is written cannot leave these testing a layout that
no longer exists. Each one is built where a real book is built — in a directory,
from a file — because the cover is a path the document points at.
"""

import tempfile
import unittest
from pathlib import Path

from server.publishing.epub_content_validation import can_convert_to_epub
from authordoc import storydoc
from authordoc.storydoc import Document
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB, BlurbCell
from authordoc.cells.cell import Cell
from authordoc.cells.chapter_cell import ChapterCell
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


class WhatStandsBetweenTheDocumentAndABook(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def test_a_bare_story_is_missing_all_four(self) -> None:
        found = can_convert_to_epub(placed(self.root, ChapterCell("One")))
        self.assertEqual(found.missing_cells, [TITLE_PAGE, TABLE_OF_CONTENTS, BLURB, ABOUT])
        self.assertFalse(found.ready_to_export)

    def test_a_section_after_the_story_is_not_missing(self) -> None:
        found = can_convert_to_epub(
            placed(self.root, ChapterCell("One"), filled_title_page())
        )
        self.assertEqual(found.missing_cells, [TABLE_OF_CONTENTS, BLURB, ABOUT])

    def test_a_document_written_back_to_front_is_ready(self) -> None:
        found = can_convert_to_epub(
            placed(
                self.root,
                AboutCell(source="I live by the sea."),
                BlurbCell(source="A lantern, and a stair."),
                TableOfContentsCell(),
                filled_title_page(),
                ChapterCell("One"),
            )
        )
        self.assertTrue(found.ready_to_export)

    def test_everything_present_and_one_of_them_empty_is_not_ready(self) -> None:
        found = can_convert_to_epub(
            placed(
                self.root,
                filled_title_page(),
                TableOfContentsCell(),
                BlurbCell(),  # written in, never filled
                ChapterCell("One"),
                AboutCell(source="I live by the sea."),
            )
        )
        self.assertEqual(found.missing_cells, [])
        self.assertFalse(found.ready_to_export)

    def test_a_document_with_everything_written_is_ready(self) -> None:
        found = can_convert_to_epub(
            placed(
                self.root,
                filled_title_page(),
                TableOfContentsCell(),
                BlurbCell(source="A lantern, and a stair."),
                ChapterCell("One"),
                AboutCell(source="I live by the sea."),
            )
        )
        self.assertTrue(found.ready_to_export)


if __name__ == "__main__":
    unittest.main()
