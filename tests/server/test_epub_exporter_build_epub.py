"""Tests for binding a story document into an EPUB.

The documents are built through `Document.save` rather than written out by hand,
so a change to how the format is written cannot leave these testing a layout that
no longer exists. Each one is built where a real book is built — in a directory,
from a file — because the cover is a path the document points at.
"""

import tempfile
import unittest
import zipfile
from pathlib import Path

from server.publishing.epub_exporter import build_epub
from authordoc import storydoc
from authordoc.storydoc import Document
from authordoc.cells.about_cell import AboutCell
from authordoc.cells.blurb_cell import BlurbCell
from authordoc.cells.cell import Cell
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.disclaimer_cell import DisclaimerCell
from authordoc.cells.divider_cell import DividerCell
from authordoc.cells.image_cell import ImageCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.note_cell import NoteCell
from authordoc.cells.part_cell import PartCell
from authordoc.cells.recap_cell import RecapCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.cells.table_of_contents_cell import TableOfContentsCell
from authordoc.cells.title_page_cell import TitlePageCell


def written(root: Path, *cells: Cell, name: str = "story") -> Path:
    """The EPUB that `cells` bind into, built from a file the way a real one is."""
    path = root / f"{name}{storydoc.EXTENSION}"
    Document.from_cells(list(cells), path).save()
    out_path = root / f"{name}.epub"
    build_epub(Document.load(path), out_path)
    return out_path


class BuildEpub(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def test_writes_a_zip_with_the_epub_skeleton(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            ChapterCell("Two"),
            MarkdownCell("more"),
        )

        self.assertTrue(zipfile.is_zipfile(out))
        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            for required in [
                "mimetype",
                "META-INF/container.xml",
                "OEBPS/content.opf",
                "OEBPS/nav.xhtml",
                "OEBPS/toc.ncx",
                "OEBPS/style.css",
            ]:
                self.assertIn(required, names)
            self.assertEqual(z.read("mimetype"), b"application/epub+zip")

    def test_mimetype_is_first_and_stored_uncompressed(self) -> None:
        out = written(self.root, ChapterCell("One"), MarkdownCell("prose"))

        with zipfile.ZipFile(out) as z:
            first = z.infolist()[0]
            # The reader finds the media type by reading this entry raw, so it must
            # lead and must not be compressed.
            self.assertEqual(first.filename, "mimetype")
            self.assertEqual(first.compress_type, zipfile.ZIP_STORED)

    def test_one_xhtml_per_chapter(self) -> None:
        out = written(
            self.root,
            ChapterCell("One"),
            MarkdownCell("a"),
            ChapterCell("Two"),
            MarkdownCell("b"),
            ChapterCell("Three"),
            MarkdownCell("c"),
        )

        with zipfile.ZipFile(out) as z:
            chapters = [n for n in z.namelist() if n.startswith("OEBPS/chap_")]
        self.assertEqual(len(chapters), 3)

    def test_a_chapter_carries_its_name_onto_its_page(self) -> None:
        out = written(
            self.root, ChapterCell("The First Night"), MarkdownCell("prose")
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/chap_000.xhtml").decode("utf-8")

        self.assertIn("<h2>The First Night</h2>", page)
        self.assertIn("<p>prose</p>", page)
        # What carries the page's margin. Without it the first-line indent is the
        # only white space on the page.
        self.assertIn('<div class="chapter">', page)

    def test_a_full_page_image_opening_the_document_is_the_cover(self) -> None:
        (self.root / "art.png").write_bytes(b"\x89PNG\r\n\x1a\n not really a png")
        out = written(
            self.root,
            ImageCell("art.png"),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("OEBPS/cover.xhtml", names)
        self.assertIn("OEBPS/art_000.png", names)
        self.assertIn('properties="cover-image"', opf)
        self.assertIn('<meta name="cover" content="cover-image"/>', opf)

    def test_a_full_page_image_after_the_story_is_a_page_of_its_own(self) -> None:
        (self.root / "art.png").write_bytes(b"png")
        (self.root / "veriona.png").write_bytes(b"png")
        out = written(
            self.root,
            ImageCell("art.png"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            ImageCell("veriona.png"),
        )

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            opf = z.read("OEBPS/content.opf").decode("utf-8")
            page = z.read("OEBPS/art_001_page.xhtml").decode("utf-8")

        self.assertIn("OEBPS/art_001.png", names)
        self.assertIn('<img src="art_001.png"', page)
        self.assertEqual(opf.count('properties="cover-image"'), 1)

    def test_an_image_in_the_prose_stands_in_the_chapter_it_was_written_in(
        self,
    ) -> None:
        (self.root / "veriona.png").write_bytes(b"png")
        out = written(
            self.root,
            ChapterCell("One"),
            MarkdownCell("prose"),
            ImageCell("veriona.png", full_page=False),
            MarkdownCell("Read [Veriona](https://amazon.example/veriona)."),
        )

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            page = z.read("OEBPS/chap_000.xhtml").decode("utf-8")

        self.assertIn("OEBPS/art_000.png", names)
        self.assertNotIn("OEBPS/art_000_page.xhtml", names)
        self.assertIn('<p class="image"><img src="art_000.png"', page)
        self.assertIn('<a href="https://amazon.example/veriona">Veriona</a>', page)

    def test_a_book_with_no_image_has_no_cover(self) -> None:
        out = written(self.root, ChapterCell("One"), MarkdownCell("prose"))

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/cover.xhtml", z.namelist())

    def test_art_nobody_has_drawn_yet_does_not_stop_the_export(self) -> None:
        # A book goes out without the picture rather than not at all.
        out = written(
            self.root,
            ImageCell("cover.jpg"),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/cover.xhtml", z.namelist())
            self.assertIn("OEBPS/chap_000.xhtml", z.namelist())

    def test_the_title_page_carries_the_book_title_and_the_author(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="My Book", author="A. Writer"),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/titlepage.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("My Book", page)
        self.assertIn("A. Writer", page)
        self.assertIn("<dc:title>My Book</dc:title>", opf)
        self.assertIn("<dc:creator>A. Writer</dc:creator>", opf)

    def test_the_title_page_carries_the_subtitle_and_publisher(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book", subtitle="A Novel", publisher="Riverlight Press"),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/titlepage.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("A Novel", page)
        self.assertIn("Riverlight Press", page)
        self.assertIn("<dc:publisher>Riverlight Press</dc:publisher>", opf)

    def test_the_edition_is_printed_and_catalogued(self) -> None:
        out = written(
            self.root,
            TitlePageCell(
                title="Book",
                date="2026-08-17",
                version="1.2",
                isbn="978-0-000-00000-0",
            ),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/copyright.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("2026-08-17", page)
        self.assertIn("Version 1.2", page)
        self.assertIn("ISBN 978-0-000-00000-0", page)
        self.assertIn("<dc:date>2026-08-17</dc:date>", opf)
        self.assertIn('urn:isbn:978-0-000-00000-0</dc:identifier>', opf)

    def test_the_title_page_is_followed_by_a_copyright_page(self) -> None:
        out = written(
            self.root,
            TitlePageCell(
                title="Book",
                author="Pierre Dupied",
                publisher="Cuir Et Soie",
                date="2026-08-17",
            ),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/copyright.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")
            nav = z.read("OEBPS/nav.xhtml").decode("utf-8")

        self.assertIn(
            "Copyright © 2026 Pierre Dupied and Cuir Et Soie. "
            "All rights reserved.",
            page,
        )
        self.assertIn("No part of this publication may be reproduced", page)
        self.assertIn(
            "The right of Pierre Dupied and Cuir Et Soie to be identified as "
            "the author of this work has been asserted in accordance with the "
            "Copyright, Designs and Patents Act 1988.",
            page,
        )
        self.assertIn("Published by Cuir Et Soie", page)
        self.assertLess(
            opf.index('idref="titlepage"'), opf.index('idref="copyright"')
        )
        # A page the reader turns past, not one they look up.
        self.assertNotIn("copyright.xhtml", nav)

    def test_the_cover_designer_is_credited_where_they_are_named(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book", cover_designer="A. Painter"),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/copyright.xhtml").decode("utf-8")

        self.assertIn("Cover design by A. Painter", page)

    def test_a_book_with_no_title_page_still_binds(self) -> None:
        out = written(self.root, ChapterCell("One"), MarkdownCell("prose"))

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertNotIn("OEBPS/titlepage.xhtml", names)
        self.assertIn("<dc:language>en</dc:language>", opf)

    def test_the_contents_cell_prints_a_page_linking_every_chapter(self) -> None:
        out = written(
            self.root,
            TableOfContentsCell(),
            ChapterCell("One"),
            MarkdownCell("a"),
            ChapterCell("Two"),
            MarkdownCell("b"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/contents.xhtml").decode("utf-8")

        self.assertIn('<a href="chap_000.xhtml">One</a>', page)
        self.assertIn('<a href="chap_001.xhtml">Two</a>', page)

    def test_a_book_that_asks_for_no_contents_gets_none(self) -> None:
        out = written(self.root, ChapterCell("One"), MarkdownCell("prose"))

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/contents.xhtml", z.namelist())

    def test_a_disclaimer_gets_a_page_under_its_own_name(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            DisclaimerCell(title="Heads Up", source="Any resemblance is coincidental."),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/disclaimer.xhtml").decode("utf-8")

        self.assertIn("<h2>Heads Up</h2>", page)
        self.assertIn("Any resemblance is coincidental.", page)

    def test_a_part_gets_a_page_of_its_own_carrying_only_its_name(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            PartCell("Book One"),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/part.xhtml").decode("utf-8")
            css = z.read("OEBPS/style.css").decode("utf-8")

        self.assertIn("<h1>Book One</h1>", page)
        self.assertIn('class="alone-on-the-page"', page)
        self.assertNotIn("prose", page)
        # Centred both ways against the reader's page, which is the whole of what
        # a part divider looks like.
        self.assertIn(".alone-on-the-page", css)
        self.assertIn("height: 100vh", css)
        self.assertIn("text-align: center", css)

    def test_a_chapter_nobody_has_written_yet_is_its_name_in_the_middle(
        self,
    ) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            ChapterCell("One"),
            ChapterCell("Two"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            alone = z.read("OEBPS/chap_000.xhtml").decode("utf-8")
            written_in = z.read("OEBPS/chap_001.xhtml").decode("utf-8")

        self.assertIn('class="alone-on-the-page"', alone)
        self.assertIn('class="chapter"', written_in)
        self.assertNotIn("alone-on-the-page", written_in)

    def test_a_picture_in_the_prose_leaves_room_for_the_words(self) -> None:
        (self.root / "art.png").write_bytes(b"png")
        out = written(
            self.root,
            ChapterCell("One"),
            MarkdownCell("prose"),
            ImageCell("art.png", full_page=False),
        )

        with zipfile.ZipFile(out) as z:
            css = z.read("OEBPS/style.css").decode("utf-8")

        self.assertIn("max-height: 45vh", css)

    def test_a_part_opens_a_page_the_chapters_under_it_do_not_share(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            PartCell("Book One"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            PartCell("Book Two"),
            ChapterCell("Two"),
            MarkdownCell("more"),
        )

        with zipfile.ZipFile(out) as z:
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        order = [
            line.split('idref="')[1].split('"')[0]
            for line in opf.splitlines()
            if "itemref" in line
        ]
        self.assertEqual(
            order,
            ["titlepage", "copyright", "part", "chap_000", "part_2", "chap_001"],
        )

    def test_a_part_with_no_name_is_numbered_by_where_it_stands(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            PartCell(),
            ChapterCell("One"),
            MarkdownCell("prose"),
            PartCell(),
            ChapterCell("Two"),
        )

        with zipfile.ZipFile(out) as z:
            first = z.read("OEBPS/part.xhtml").decode("utf-8")
            second = z.read("OEBPS/part_2.xhtml").decode("utf-8")

        self.assertIn("<h1>Part 1</h1>", first)
        self.assertIn("<h1>Part 2</h1>", second)

    def test_a_divider_reaches_no_page_of_the_book(self) -> None:
        # What it is for: the author says where the story divides into files, and
        # the reader turns from one chapter to the next without meeting the cut.
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            DividerCell(),
            ChapterCell("Two"),
            MarkdownCell("more"),
        )

        with zipfile.ZipFile(out) as z:
            opf = z.read("OEBPS/content.opf").decode("utf-8")
            nav = z.read("OEBPS/nav.xhtml").decode("utf-8")

        order = [
            line.split('idref="')[1].split('"')[0]
            for line in opf.splitlines()
            if "itemref" in line
        ]
        self.assertEqual(
            order, ["titlepage", "copyright", "chap_000", "chap_001"]
        )
        self.assertNotIn("divider", nav)

    def test_a_divider_does_not_take_a_number_from_the_parts(self) -> None:
        # The reader numbers the pages they meet: a part after a divider is the
        # second part of the book, not the third.
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            PartCell(),
            ChapterCell("One"),
            DividerCell(),
            ChapterCell("Two"),
            PartCell(),
            ChapterCell("Three"),
        )

        with zipfile.ZipFile(out) as z:
            first = z.read("OEBPS/part.xhtml").decode("utf-8")
            second = z.read("OEBPS/part_2.xhtml").decode("utf-8")

        self.assertIn("<h1>Part 1</h1>", first)
        self.assertIn("<h1>Part 2</h1>", second)

    def test_a_part_is_somewhere_the_reader_can_navigate_to(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            PartCell("Book One"),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            nav = z.read("OEBPS/nav.xhtml").decode("utf-8")

        self.assertIn("Book One", nav)

    def test_the_contents_page_lists_the_chapters_under_their_part(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            TableOfContentsCell(),
            PartCell("Book One"),
            ChapterCell("One"),
            MarkdownCell("a"),
            PartCell("Book Two"),
            ChapterCell("Two"),
            MarkdownCell("b"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/contents.xhtml").decode("utf-8")

        self.assertIn(
            '<li><a href="part.xhtml">Book One</a>\n'
            "      <ol>\n"
            '        <li><a href="chap_000.xhtml">One</a></li>\n'
            "      </ol>",
            page,
        )
        self.assertIn('<li><a href="part_2.xhtml">Book Two</a>', page)
        self.assertIn('<li><a href="chap_001.xhtml">Two</a></li>', page)

    def test_the_contents_page_is_numbered_and_read_down_the_page(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            TableOfContentsCell(),
            ChapterCell("One"),
            MarkdownCell("a"),
        )

        with zipfile.ZipFile(out) as z:
            css = z.read("OEBPS/style.css").decode("utf-8")

        self.assertIn(".contents ol { text-align: left;", css)
        self.assertIn("padding-left: 2em;", css)
        self.assertNotIn(".contents ol { list-style: none;", css)

    def test_a_divider_reaches_no_line_of_the_contents(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            TableOfContentsCell(),
            DividerCell(),
            ChapterCell("One"),
            MarkdownCell("a"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/contents.xhtml").decode("utf-8")

        self.assertNotIn("divider", page)
        self.assertIn('    <li><a href="chap_000.xhtml">One</a></li>', page)

    def test_the_navigation_holds_the_chapters_under_their_part(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            PartCell("Book One"),
            ChapterCell("One"),
            MarkdownCell("a"),
        )

        with zipfile.ZipFile(out) as z:
            nav = z.read("OEBPS/nav.xhtml").decode("utf-8")
            ncx = z.read("OEBPS/toc.ncx").decode("utf-8")

        self.assertIn(
            '<li><a href="part.xhtml">Book One</a>\n'
            "        <ol>\n"
            '          <li><a href="chap_000.xhtml">One</a></li>\n'
            "        </ol>",
            nav,
        )
        self.assertIn('<meta name="dtb:depth" content="2"/>', ncx)
        self.assertIn(
            '      <navPoint id="np2" playOrder="2">\n'
            "        <navLabel><text>One</text></navLabel>\n"
            '        <content src="chap_000.xhtml"/>\n'
            "      </navPoint>",
            ncx,
        )

    def test_a_page_that_is_not_of_the_story_closes_the_part_before_it(
        self,
    ) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            PartCell("Book One"),
            ChapterCell("One"),
            MarkdownCell("a"),
            AboutCell(website="https://writer.example"),
        )

        with zipfile.ZipFile(out) as z:
            nav = z.read("OEBPS/nav.xhtml").decode("utf-8")

        self.assertIn(
            '      <li><a href="about.xhtml">About the Author</a></li>', nav
        )

    def test_a_book_with_no_disclaimer_has_no_disclaimer_page(self) -> None:
        out = written(self.root, ChapterCell("One"), MarkdownCell("prose"))

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/disclaimer.xhtml", z.namelist())

    def test_the_authors_page_carries_the_blurb_and_the_links(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book", author="A. Writer"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            AboutCell(kdp="https://amazon.example/author/1", website="https://writer.example", substack="https://writer.substack.example", source="A. Writer lives by the sea."),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/about.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("<h2>About the Author</h2>", page)
        self.assertIn("A. Writer lives by the sea.", page)
        self.assertIn("https://amazon.example/author/1", page)
        self.assertIn("https://writer.example", page)
        self.assertIn("https://writer.substack.example", page)
        # Where to find the author stands under the heading, above what they
        # wrote about themselves.
        self.assertLess(
            page.index('<div class="links">'),
            page.index("A. Writer lives by the sea."),
        )
        # The back matter comes after the story, not before it.
        self.assertLess(opf.index('idref="chap_000"'), opf.index('idref="about"'))

    def test_the_authors_links_stand_apart_and_one_to_a_line(self) -> None:
        out = written(
            self.root,
            ChapterCell("One"),
            MarkdownCell("prose"),
            AboutCell(kdp="https://amazon.example/author/1", website="https://writer.example", source="A. Writer lives by the sea."),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/about.xhtml").decode("utf-8")

        # A list of places to go, not a line of prose running on from the blurb.
        self.assertIn('<div class="links">', page)
        opened = page.index('<div class="links">')
        links = page[opened : page.index("</div>", opened)]
        self.assertEqual(links.count("<p>"), 2)

    def test_the_portrait_stands_beside_the_links_and_is_bound_in(self) -> None:
        (self.root / "author.jpg").write_bytes(b"jpg")
        out = written(
            self.root,
            TitlePageCell(title="Book", author="A. Writer"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            AboutCell(kdp="https://amazon.example/author/1", portrait="author.jpg", source="A. Writer lives by the sea."),
        )

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            page = z.read("OEBPS/about.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")
            css = z.read("OEBPS/style.css").decode("utf-8")

        self.assertIn("OEBPS/art_000.jpg", names)
        self.assertIn('<img class="portrait" src="art_000.jpg"', page)
        self.assertIn('alt="A. Writer"', page)
        # One block, so the face and the list are read as one thing.
        who = page[page.index('<div class="who">') :]
        self.assertIn('<div class="links">', who)
        self.assertIn('href="art_000.jpg"', opf)
        # Given a width rather than a ceiling, so art of any size comes down to
        # the same share of the page and the links have somewhere to stand.
        self.assertIn(".about .who .portrait { width: 34%", css)

    def test_a_portrait_nobody_has_drawn_yet_leaves_the_page_standing(
        self,
    ) -> None:
        out = written(
            self.root,
            ChapterCell("One"),
            MarkdownCell("prose"),
            AboutCell(portrait="nobody.jpg", source="A. Writer lives by the sea."),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/about.xhtml").decode("utf-8")
            self.assertNotIn("art_000", z.read("OEBPS/content.opf").decode("utf-8"))

        self.assertIn("A. Writer lives by the sea.", page)
        self.assertNotIn("<img", page)

    def test_an_author_page_with_nothing_on_it_is_not_printed(self) -> None:
        out = written(
            self.root,
            ChapterCell("One"),
            MarkdownCell("prose"),
            AboutCell(),
        )

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/about.xhtml", z.namelist())

    def test_the_spine_reads_in_the_order_the_document_lays_it_out(self) -> None:
        (self.root / "art.png").write_bytes(b"\x89PNG\r\n\x1a\n not really a png")
        out = written(
            self.root,
            ImageCell("art.png"),
            TitlePageCell(title="Book"),
            TableOfContentsCell(),
            DisclaimerCell(title="Disclaimer", source="All fiction."),
            ChapterCell("One"),
            MarkdownCell("prose"),
            AboutCell(website="https://writer.example"),
        )

        with zipfile.ZipFile(out) as z:
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        order = [
            line.split('idref="')[1].split('"')[0]
            for line in opf.splitlines()
            if "itemref" in line
        ]
        self.assertEqual(
            order,
            [
                "cover",
                "titlepage",
                "copyright",
                "contents",
                "disclaimer",
                "chap_000",
                "about",
            ],
        )

    def test_prose_standing_outside_every_chapter_is_still_printed(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            MarkdownCell("For my mother."),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            self.assertIn("OEBPS/page_000.xhtml", z.namelist())
            page = z.read("OEBPS/page_000.xhtml").decode("utf-8")

        self.assertIn("For my mother.", page)

    def test_the_table_of_contents_names_the_chapters_and_the_named_pages(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            DisclaimerCell(title="Disclaimer", source="All fiction."),
            ChapterCell("One"),
            MarkdownCell("prose"),
            AboutCell(website="https://writer.example"),
        )

        with zipfile.ZipFile(out) as z:
            nav = z.read("OEBPS/nav.xhtml").decode("utf-8")

        self.assertIn("Disclaimer", nav)
        self.assertIn("One", nav)
        self.assertIn("About the Author", nav)
        # Neither the cover nor the title page is somewhere a reader looks up.
        self.assertNotIn("titlepage.xhtml", nav)

    def test_the_blurb_reaches_no_part_of_the_book(self) -> None:
        # It is what the author writes to sell the story, not part of the story.
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            BlurbCell(source="A woman loses her name."),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            everything = "".join(
                z.read(name).decode("utf-8")
                for name in z.namelist()
                if name.endswith((".xhtml", ".opf", ".ncx"))
            )

        self.assertNotIn("A woman loses her name.", everything)

    def test_the_story_so_far_reaches_no_part_of_the_book(self) -> None:
        # A recap of the volumes before this one is written for a reader, but it
        # is written about the story rather than in it — so it stays beside the
        # manuscript with the blurb and is bound into nothing.
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            RecapCell(documents="a.author, b.author", source="She has lost her name."),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            everything = "".join(
                z.read(name).decode("utf-8")
                for name in z.namelist()
                if name.endswith((".xhtml", ".opf", ".ncx"))
            )

        self.assertNotIn("She has lost her name.", everything)

    def test_a_note_reaches_no_part_of_the_book(self) -> None:
        # What the author left themselves about the plot stands in the middle of
        # the story and is printed nowhere in it.
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            NoteCell(source="She has to find the letter here."),
        )

        with zipfile.ZipFile(out) as z:
            everything = "".join(
                z.read(name).decode("utf-8")
                for name in z.namelist()
                if name.endswith((".xhtml", ".opf", ".ncx"))
            )

        self.assertNotIn("She has to find the letter here.", everything)

    def test_a_salient_concept_reaches_no_part_of_the_book(self) -> None:
        out = written(
            self.root,
            TitlePageCell(title="Book"),
            ChapterCell("One"),
            MarkdownCell("prose"),
            SalientConceptCell(title="Michael", source="Sarah's husband."),
        )

        with zipfile.ZipFile(out) as z:
            everything = "".join(
                z.read(name).decode("utf-8")
                for name in z.namelist()
                if name.endswith((".xhtml", ".opf", ".ncx"))
            )

        self.assertNotIn("Sarah's husband.", everything)

    def test_a_section_written_twice_still_binds(self) -> None:
        # Two manifest items under one id is a book no reader will open.
        out = written(
            self.root,
            DisclaimerCell(title="Disclaimer", source="First."),
            DisclaimerCell(title="Disclaimer", source="Second."),
            ChapterCell("One"),
            MarkdownCell("prose"),
        )

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("OEBPS/disclaimer.xhtml", names)
        self.assertIn("OEBPS/disclaimer_2.xhtml", names)
        self.assertEqual(opf.count('idref="disclaimer"'), 1)


if __name__ == "__main__":
    unittest.main()
