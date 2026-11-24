import unittest

from server.publishing.document_to_epub_content_converter import cell_export_order_of
from authordoc.cells.about_cell import AboutCell
from authordoc.cells.blurb_cell import BlurbCell
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.disclaimer_cell import DisclaimerCell
from authordoc.cells.image_cell import ImageCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.table_of_contents_cell import TableOfContentsCell
from authordoc.cells.title_page_cell import TitlePageCell


class CellExportOrder(unittest.TestCase):
    def test_the_front_matter_opens_the_book_and_the_about_page_closes_it(self) -> None:
        about = AboutCell(source="I live by the sea.")
        blurb = BlurbCell(source="A lantern, and a stair.")
        contents = TableOfContentsCell()
        title_page = TitlePageCell(title="Book")
        chapter = ChapterCell("One")

        in_export_order = cell_export_order_of([about, blurb, contents, title_page, chapter])

        self.assertEqual(in_export_order, [title_page, contents, blurb, chapter, about])

    def test_the_story_keeps_the_order_it_was_written_in(self) -> None:
        one = ChapterCell("One")
        prose = MarkdownCell("The lantern.")
        two = ChapterCell("Two")

        in_export_order = cell_export_order_of([one, prose, two])

        self.assertEqual(in_export_order, [one, prose, two])

    def test_a_picture_the_document_opens_with_stays_first(self) -> None:
        picture = ImageCell("art.png")
        chapter = ChapterCell("One")
        title_page = TitlePageCell(title="Book")

        in_export_order = cell_export_order_of([picture, chapter, title_page])

        self.assertEqual(in_export_order, [picture, title_page, chapter])

    def test_the_disclaimer_keeps_the_place_the_author_gave_it(self) -> None:
        chapter = ChapterCell("One")
        disclaimer = DisclaimerCell(source="All fiction.")
        title_page = TitlePageCell(title="Book")

        in_export_order = cell_export_order_of([chapter, disclaimer, title_page])

        self.assertEqual(in_export_order, [title_page, chapter, disclaimer])

    def test_only_the_first_of_a_kind_is_moved(self) -> None:
        chapter = ChapterCell("One")
        first_contents = TableOfContentsCell()
        second_contents = TableOfContentsCell()

        in_export_order = cell_export_order_of([chapter, first_contents, second_contents])

        self.assertEqual(in_export_order, [first_contents, chapter, second_contents])


if __name__ == "__main__":
    unittest.main()
