import unittest

from server.publishing.epub_exporter import chapters_of
from authordoc.storydoc import Document
from authordoc.cells.cell import Cell
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.disclaimer_cell import DisclaimerCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.title_page_cell import TitlePageCell


def document(*cells: Cell) -> Document:
    """A document written the way the format writes one."""
    return Document.from_cells(list(cells))


class Chapters(unittest.TestCase):
    def test_a_chapter_per_chapter_cell(self) -> None:
        chapters = chapters_of(
            document(
                ChapterCell("One"),
                MarkdownCell("a"),
                ChapterCell("Two"),
                MarkdownCell("b"),
            )
        )
        self.assertEqual([c.title for c in chapters], ["One", "Two"])

    def test_front_matter_before_the_first_chapter_is_not_a_chapter(self) -> None:
        chapters = chapters_of(
            document(
                TitlePageCell(title="Book"),
                MarkdownCell("intro"),
                ChapterCell("One"),
                MarkdownCell("prose"),
            )
        )
        # The book's title opens the title page, not a chapter of its own.
        self.assertEqual([c.title for c in chapters], ["One"])

    def test_a_document_with_no_chapter_cells_has_no_chapters(self) -> None:
        chapters = chapters_of(document(MarkdownCell("just some prose\nand more")))
        self.assertEqual(chapters, [])

    def test_a_heading_in_the_prose_is_prose(self) -> None:
        # The kind is the cell's identity; what someone wrote in a paragraph is
        # not a place in the book.
        chapters = chapters_of(document(MarkdownCell("## Not A Chapter\n\nprose")))
        self.assertEqual(chapters, [])

    def test_the_prose_under_a_chapter_is_its_body(self) -> None:
        chapters = chapters_of(
            document(
                ChapterCell("One"),
                MarkdownCell("first"),
                MarkdownCell("second"),
            )
        )
        self.assertEqual(chapters[0].body_lines, ["first", "second"])

    def test_chapters_are_numbered_in_order(self) -> None:
        chapters = chapters_of(
            document(
                ChapterCell("A"),
                MarkdownCell("x"),
                ChapterCell("B"),
                MarkdownCell("y"),
            )
        )
        self.assertEqual(
            [c.filename for c in chapters],
            ["chap_000.xhtml", "chap_001.xhtml"],
        )

    def test_a_page_between_two_chapters_is_not_part_of_either(self) -> None:
        # A disclaimer carries prose of its own, and that prose is the page's,
        # never the chapter it happens to follow.
        chapters = chapters_of(
            document(
                ChapterCell("One"),
                MarkdownCell("prose"),
                DisclaimerCell(title="Disclaimer", source="All fiction."),
                ChapterCell("Two"),
                MarkdownCell("more"),
            )
        )
        self.assertEqual([c.body_lines for c in chapters], [["prose"], ["more"]])


if __name__ == "__main__":
    unittest.main()
