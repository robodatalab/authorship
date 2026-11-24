"""Tests for binding a story document into an EPUB.

The documents are built through `Document.save` rather than written out by hand,
so a change to how the format is written cannot leave these testing a layout that
no longer exists. Each one is built where a real book is built — in a directory,
from a file — because the cover is a path the document points at.
"""

import tempfile
import unittest
from pathlib import Path

from server.publishing.epub_content_validation import CLOSING, OPENING, REQUIRED, report_of
from authordoc import storydoc
from authordoc.storydoc import Document
from authordoc.cells.about_cell import AboutCell
from authordoc.cells.blurb_cell import BlurbCell
from authordoc.cells.cell import Cell
from authordoc.cells.chapter_cell import CHAPTER, ChapterCell
from authordoc.cells.disclaimer_cell import DISCLAIMER, DisclaimerCell
from authordoc.cells.image_cell import ImageCell
from authordoc.cells.markdown_cell import MarkdownCell
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
        found = report_of(placed(self.root, ChapterCell("One")))
        self.assertEqual(found.added, REQUIRED)
        self.assertFalse(found.ready)

    def test_the_plan_opens_and_closes_the_document(self) -> None:
        found = report_of(placed(self.root, ChapterCell("One")))
        self.assertEqual(
            [slot.kind for slot in found.plan],
            [*OPENING, CHAPTER, *CLOSING],
        )

    def test_a_section_already_there_is_carried_by_index(self) -> None:
        found = report_of(
            placed(self.root, ChapterCell("One"), filled_title_page())
        )
        self.assertNotIn(TITLE_PAGE, found.added)
        self.assertEqual(found.plan[0].at, 1)

    def test_the_story_keeps_the_order_it_was_written_in(self) -> None:
        found = report_of(
            placed(
                self.root,
                ChapterCell("One"),
                MarkdownCell("The lantern."),
                ChapterCell("Two"),
            )
        )
        self.assertEqual([s.at for s in found.plan if s.at is not None], [0, 1, 2])

    def test_a_section_that_passed_the_story_has_moved(self) -> None:
        found = report_of(
            placed(self.root, ChapterCell("One"), TableOfContentsCell())
        )
        self.assertIn(TABLE_OF_CONTENTS, found.moved)

    def test_writing_a_section_in_moves_nothing(self) -> None:
        # The about page is last before and last after; only its index changed.
        found = report_of(
            placed(
                self.root,
                ChapterCell("One"),
                AboutCell(source="I live by the sea."),
            )
        )
        self.assertEqual(found.moved, ())

    def test_a_front_matter_written_back_to_front_has_all_of_it_moved(self) -> None:
        found = report_of(
            placed(
                self.root,
                AboutCell(source="I live by the sea."),
                BlurbCell(source="A lantern, and a stair."),
                TableOfContentsCell(),
                filled_title_page(),
                ChapterCell("One"),
            )
        )
        self.assertEqual(found.added, ())
        self.assertEqual(found.moved, REQUIRED)

    def test_a_picture_the_document_opens_with_keeps_its_place(self) -> None:
        found = report_of(
            placed(
                self.root,
                ImageCell("art.png"),
                filled_title_page(),
                TableOfContentsCell(),
                BlurbCell(source="A lantern, and a stair."),
                ChapterCell("One"),
                AboutCell(source="I live by the sea."),
            )
        )
        self.assertEqual(found.moved, ())
        self.assertEqual(found.plan[0].at, 0)

    def test_the_disclaimer_keeps_the_place_the_author_gave_it(self) -> None:
        found = report_of(
            placed(
                self.root,
                DisclaimerCell(source="All fiction."),
                ChapterCell("One"),
            )
        )
        self.assertEqual(
            [slot.kind for slot in found.plan],
            [*OPENING, DISCLAIMER, CHAPTER, *CLOSING],
        )

    def test_only_the_first_of_a_kind_is_claimed(self) -> None:
        found = report_of(
            placed(
                self.root,
                ChapterCell("One"),
                TableOfContentsCell(),
                TableOfContentsCell(),
            )
        )
        self.assertEqual(found.plan[1].at, 1)
        self.assertIn(2, [slot.at for slot in found.plan[3:]])

    def test_everything_present_and_one_of_them_empty_is_not_ready(self) -> None:
        found = report_of(
            placed(
                self.root,
                filled_title_page(),
                TableOfContentsCell(),
                BlurbCell(),  # written in, never filled
                ChapterCell("One"),
                AboutCell(source="I live by the sea."),
            )
        )
        self.assertEqual(found.added, ())
        self.assertEqual(found.moved, ())
        self.assertFalse(found.ready)

    def test_a_document_with_everything_written_is_ready(self) -> None:
        found = report_of(
            placed(
                self.root,
                filled_title_page(),
                TableOfContentsCell(),
                BlurbCell(source="A lantern, and a stair."),
                ChapterCell("One"),
                AboutCell(source="I live by the sea."),
            )
        )
        self.assertTrue(found.ready)


if __name__ == "__main__":
    unittest.main()
