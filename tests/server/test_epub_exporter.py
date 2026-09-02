"""Tests for binding a story document into an EPUB.

The documents are built through `storydoc.save` rather than written out by hand,
so a change to how the format is written cannot leave these testing a layout that
no longer exists. Each one is built where a real book is built — in a directory,
from a file — because the cover is a path the document points at.
"""

import tempfile
import unittest
import zipfile
from pathlib import Path

from server.publishing.epub_exporter import (
    ART,
    CLOSING,
    OPENING,
    REQUIRED,
    TEXT,
    _inline,
    blocks_to_xhtml,
    build_epub,
    chapters_of,
    read_book,
    report_of,
)
from server import storydoc
from server.storydoc import Cell, Document


def document(*cells: Cell) -> Document:
    """A document written the way the format writes one."""
    return Document(storydoc.dumps(list(cells)))


def title_page(**attrs: str) -> Cell:
    return Cell(storydoc.TITLE_PAGE, "", attrs)


def written(root: Path, *cells: Cell, name: str = "story") -> Path:
    """The EPUB that `cells` bind into, built from a file the way a real one is."""
    path = root / f"{name}{storydoc.EXTENSION}"
    storydoc.save(path, list(cells))
    out_path = root / f"{name}.epub"
    build_epub(Document.load(path), out_path)
    return out_path


class Inline(unittest.TestCase):
    def test_bold_italic_and_links(self) -> None:
        self.assertEqual(_inline("**bold**"), "<strong>bold</strong>")
        self.assertEqual(_inline("*italic*"), "<em>italic</em>")
        self.assertEqual(_inline("_italic_"), "<em>italic</em>")
        self.assertEqual(
            _inline("[text](http://example.com)"),
            '<a href="http://example.com">text</a>',
        )

    def test_escapes_before_it_formats(self) -> None:
        # The angle bracket is escaped, but the surrounding ** still becomes a tag.
        self.assertEqual(_inline("**a < b**"), "<strong>a &lt; b</strong>")

    def test_a_double_star_is_not_read_as_italic(self) -> None:
        self.assertNotIn("<em>", _inline("**bold**"))


class Blocks(unittest.TestCase):
    def test_a_blank_line_ends_a_paragraph(self) -> None:
        self.assertEqual(
            blocks_to_xhtml(["one", "still one", "", "two"]),
            "<p>one still one</p>\n<p>two</p>",
        )

    def test_headings(self) -> None:
        self.assertEqual(blocks_to_xhtml(["# Title"]), "<h1>Title</h1>")
        self.assertEqual(blocks_to_xhtml(["## Two"]), "<h2>Two</h2>")
        self.assertEqual(blocks_to_xhtml(["### Three"]), "<h3>Three</h3>")

    def test_a_rule_of_three_or_more_is_a_scene_break(self) -> None:
        for rule in ["---", "***", "___", "----"]:
            with self.subTest(rule=rule):
                self.assertIn(
                    '<hr class="scene-break"/>',
                    blocks_to_xhtml(["a", "", rule, "", "b"]),
                )


class Chapters(unittest.TestCase):
    def test_a_chapter_per_chapter_cell(self) -> None:
        chapters = chapters_of(
            document(
                storydoc.chapter("One"),
                storydoc.markdown("a"),
                storydoc.chapter("Two"),
                storydoc.markdown("b"),
            )
        )
        self.assertEqual([c.title for c in chapters], ["One", "Two"])

    def test_front_matter_before_the_first_chapter_is_not_a_chapter(self) -> None:
        chapters = chapters_of(
            document(
                title_page(title="Book"),
                storydoc.markdown("intro"),
                storydoc.chapter("One"),
                storydoc.markdown("prose"),
            )
        )
        # The book's title opens the title page, not a chapter of its own.
        self.assertEqual([c.title for c in chapters], ["One"])

    def test_a_document_with_no_chapter_cells_has_no_chapters(self) -> None:
        chapters = chapters_of(document(storydoc.markdown("just some prose\nand more")))
        self.assertEqual(chapters, [])

    def test_a_heading_in_the_prose_is_prose(self) -> None:
        # The kind is the cell's identity; what someone wrote in a paragraph is
        # not a place in the book.
        chapters = chapters_of(document(storydoc.markdown("## Not A Chapter\n\nprose")))
        self.assertEqual(chapters, [])

    def test_the_prose_under_a_chapter_is_its_body(self) -> None:
        chapters = chapters_of(
            document(
                storydoc.chapter("One"),
                storydoc.markdown("first"),
                storydoc.markdown("second"),
            )
        )
        self.assertEqual(chapters[0].body_lines, ["first", "", "second"])

    def test_chapters_are_numbered_in_order(self) -> None:
        chapters = chapters_of(
            document(
                storydoc.chapter("A"),
                storydoc.markdown("x"),
                storydoc.chapter("B"),
                storydoc.markdown("y"),
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
                storydoc.chapter("One"),
                storydoc.markdown("prose"),
                Cell(storydoc.DISCLAIMER, "All fiction.", {"title": "Disclaimer"}),
                storydoc.chapter("Two"),
                storydoc.markdown("more"),
            )
        )
        self.assertEqual([c.body_lines for c in chapters], [["prose"], ["more"]])


class BuildEpub(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def test_writes_a_zip_with_the_epub_skeleton(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            storydoc.chapter("Two"),
            storydoc.markdown("more"),
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
        out = written(self.root, storydoc.chapter("One"), storydoc.markdown("prose"))

        with zipfile.ZipFile(out) as z:
            first = z.infolist()[0]
            # The reader finds the media type by reading this entry raw, so it must
            # lead and must not be compressed.
            self.assertEqual(first.filename, "mimetype")
            self.assertEqual(first.compress_type, zipfile.ZIP_STORED)

    def test_one_xhtml_per_chapter(self) -> None:
        out = written(
            self.root,
            storydoc.chapter("One"),
            storydoc.markdown("a"),
            storydoc.chapter("Two"),
            storydoc.markdown("b"),
            storydoc.chapter("Three"),
            storydoc.markdown("c"),
        )

        with zipfile.ZipFile(out) as z:
            chapters = [n for n in z.namelist() if n.startswith("OEBPS/chap_")]
        self.assertEqual(len(chapters), 3)

    def test_a_chapter_carries_its_name_onto_its_page(self) -> None:
        out = written(
            self.root, storydoc.chapter("The First Night"), storydoc.markdown("prose")
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/chap_000.xhtml").decode("utf-8")

        self.assertIn("<h2>The First Night</h2>", page)
        self.assertIn("<p>prose</p>", page)
        # What carries the page's margin. Without it the first-line indent is the
        # only white space on the page.
        self.assertIn('<div class="chapter">', page)

    def test_the_cover_cell_embeds_the_art_it_points_at(self) -> None:
        (self.root / "art.png").write_bytes(b"\x89PNG\r\n\x1a\n not really a png")
        out = written(
            self.root,
            storydoc.cover("art.png"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("OEBPS/cover.xhtml", names)
        self.assertIn("OEBPS/cover.png", names)
        self.assertIn('properties="cover-image"', opf)
        self.assertIn('<meta name="cover" content="cover-image"/>', opf)

    def test_a_book_with_no_cover_cell_has_no_cover(self) -> None:
        out = written(self.root, storydoc.chapter("One"), storydoc.markdown("prose"))

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/cover.xhtml", z.namelist())

    def test_a_cover_nobody_has_drawn_yet_does_not_stop_the_export(self) -> None:
        # The editor hands a new cover cell a placeholder path. A book goes out
        # without a cover rather than not at all.
        out = written(
            self.root,
            storydoc.cover("cover.jpg"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/cover.xhtml", z.namelist())
            self.assertIn("OEBPS/chap_000.xhtml", z.namelist())

    def test_the_title_page_carries_the_book_title_and_the_author(self) -> None:
        out = written(
            self.root,
            title_page(title="My Book", author="A. Writer"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
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
            title_page(title="Book", subtitle="A Novel", publisher="Riverlight Press"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
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
            title_page(
                title="Book",
                date="2026-08-17",
                version="1.2",
                isbn="978-0-000-00000-0",
            ),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/titlepage.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("2026-08-17", page)
        self.assertIn("Version 1.2", page)
        self.assertIn("ISBN 978-0-000-00000-0", page)
        self.assertIn("<dc:date>2026-08-17</dc:date>", opf)
        self.assertIn('urn:isbn:978-0-000-00000-0</dc:identifier>', opf)

    def test_a_book_with_no_title_page_still_binds(self) -> None:
        out = written(self.root, storydoc.chapter("One"), storydoc.markdown("prose"))

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertNotIn("OEBPS/titlepage.xhtml", names)
        self.assertIn("<dc:language>en</dc:language>", opf)

    def test_the_contents_cell_prints_a_page_linking_every_chapter(self) -> None:
        out = written(
            self.root,
            storydoc.contents(),
            storydoc.chapter("One"),
            storydoc.markdown("a"),
            storydoc.chapter("Two"),
            storydoc.markdown("b"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/contents.xhtml").decode("utf-8")

        self.assertIn('<a href="chap_000.xhtml">One</a>', page)
        self.assertIn('<a href="chap_001.xhtml">Two</a>', page)

    def test_a_book_that_asks_for_no_contents_gets_none(self) -> None:
        out = written(self.root, storydoc.chapter("One"), storydoc.markdown("prose"))

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/contents.xhtml", z.namelist())

    def test_a_disclaimer_gets_a_page_under_its_own_name(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            Cell(
                storydoc.DISCLAIMER,
                "Any resemblance is coincidental.",
                {"title": "Heads Up"},
            ),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/disclaimer.xhtml").decode("utf-8")

        self.assertIn("<h2>Heads Up</h2>", page)
        self.assertIn("Any resemblance is coincidental.", page)

    def test_a_part_gets_a_page_of_its_own_carrying_only_its_name(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            storydoc.part("Book One"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/part.xhtml").decode("utf-8")
            css = z.read("OEBPS/style.css").decode("utf-8")

        self.assertIn("<h1>Book One</h1>", page)
        self.assertIn('class="part-page"', page)
        self.assertNotIn("prose", page)
        # Centred both ways against the reader's page, which is the whole of what
        # a part divider looks like.
        self.assertIn(".part-page", css)
        self.assertIn("height: 100vh", css)
        self.assertIn("text-align: center", css)

    def test_a_part_opens_a_page_the_chapters_under_it_do_not_share(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            storydoc.part("Book One"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            storydoc.part("Book Two"),
            storydoc.chapter("Two"),
            storydoc.markdown("more"),
        )

        with zipfile.ZipFile(out) as z:
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        order = [
            line.split('idref="')[1].split('"')[0]
            for line in opf.splitlines()
            if "itemref" in line
        ]
        self.assertEqual(
            order, ["titlepage", "part", "chap_000", "part_2", "chap_001"]
        )

    def test_a_part_with_no_name_is_numbered_by_where_it_stands(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            Cell(storydoc.PART, "", {}),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            Cell(storydoc.PART, "", {}),
            storydoc.chapter("Two"),
        )

        with zipfile.ZipFile(out) as z:
            first = z.read("OEBPS/part.xhtml").decode("utf-8")
            second = z.read("OEBPS/part_2.xhtml").decode("utf-8")

        self.assertIn("<h1>Part 1</h1>", first)
        self.assertIn("<h1>Part 2</h1>", second)

    def test_a_part_is_somewhere_the_reader_can_navigate_to(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            storydoc.part("Book One"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            nav = z.read("OEBPS/nav.xhtml").decode("utf-8")

        self.assertIn("Book One", nav)

    def test_a_book_with_no_disclaimer_has_no_disclaimer_page(self) -> None:
        out = written(self.root, storydoc.chapter("One"), storydoc.markdown("prose"))

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/disclaimer.xhtml", z.namelist())

    def test_the_authors_page_carries_the_blurb_and_the_links(self) -> None:
        out = written(
            self.root,
            title_page(title="Book", author="A. Writer"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            Cell(
                storydoc.ABOUT,
                "A. Writer lives by the sea.",
                {
                    "kdp": "https://amazon.example/author/1",
                    "website": "https://writer.example",
                    "substack": "https://writer.substack.example",
                },
            ),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/about.xhtml").decode("utf-8")
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("<h2>About the Author</h2>", page)
        self.assertIn("A. Writer lives by the sea.", page)
        self.assertIn("https://amazon.example/author/1", page)
        self.assertIn("https://writer.example", page)
        self.assertIn("https://writer.substack.example", page)
        # The back matter comes after the story, not before it.
        self.assertLess(opf.index('idref="chap_000"'), opf.index('idref="about"'))

    def test_the_authors_links_stand_apart_and_one_to_a_line(self) -> None:
        out = written(
            self.root,
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            Cell(
                storydoc.ABOUT,
                "A. Writer lives by the sea.",
                {"kdp": "https://amazon.example/author/1", "website": "https://writer.example"},
            ),
        )

        with zipfile.ZipFile(out) as z:
            page = z.read("OEBPS/about.xhtml").decode("utf-8")

        # A list of places to go, not a line of prose running on from the blurb.
        self.assertIn('<div class="links">', page)
        links = page[page.index('<div class="links">') :]
        self.assertEqual(links.count("<p>"), 2)

    def test_an_author_page_with_nothing_on_it_is_not_printed(self) -> None:
        out = written(
            self.root,
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            Cell(storydoc.ABOUT, "", {}),
        )

        with zipfile.ZipFile(out) as z:
            self.assertNotIn("OEBPS/about.xhtml", z.namelist())

    def test_the_spine_reads_in_the_order_the_document_lays_it_out(self) -> None:
        (self.root / "art.png").write_bytes(b"\x89PNG\r\n\x1a\n not really a png")
        out = written(
            self.root,
            storydoc.cover("art.png"),
            title_page(title="Book"),
            storydoc.contents(),
            Cell(storydoc.DISCLAIMER, "All fiction.", {"title": "Disclaimer"}),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            Cell(storydoc.ABOUT, "", {"website": "https://writer.example"}),
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
            ["cover", "titlepage", "contents", "disclaimer", "chap_000", "about"],
        )

    def test_prose_standing_outside_every_chapter_is_still_printed(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            storydoc.markdown("For my mother."),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            self.assertIn("OEBPS/page_000.xhtml", z.namelist())
            page = z.read("OEBPS/page_000.xhtml").decode("utf-8")

        self.assertIn("For my mother.", page)

    def test_the_table_of_contents_names_the_chapters_and_the_named_pages(self) -> None:
        out = written(
            self.root,
            title_page(title="Book"),
            Cell(storydoc.DISCLAIMER, "All fiction.", {"title": "Disclaimer"}),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            Cell(storydoc.ABOUT, "", {"website": "https://writer.example"}),
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
            title_page(title="Book"),
            Cell(storydoc.BLURB, "A woman loses her name.", {}),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            everything = "".join(
                z.read(name).decode("utf-8")
                for name in z.namelist()
                if name.endswith((".xhtml", ".opf", ".ncx"))
            )

        self.assertNotIn("A woman loses her name.", everything)

    def test_a_note_reaches_no_part_of_the_book(self) -> None:
        # What the author left themselves about the plot stands in the middle of
        # the story and is printed nowhere in it.
        out = written(
            self.root,
            title_page(title="Book"),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
            Cell(storydoc.NOTE, "She has to find the letter here.", {}),
        )

        with zipfile.ZipFile(out) as z:
            everything = "".join(
                z.read(name).decode("utf-8")
                for name in z.namelist()
                if name.endswith((".xhtml", ".opf", ".ncx"))
            )

        self.assertNotIn("She has to find the letter here.", everything)

    def test_a_section_written_twice_still_binds(self) -> None:
        # Two manifest items under one id is a book no reader will open.
        out = written(
            self.root,
            Cell(storydoc.DISCLAIMER, "First.", {"title": "Disclaimer"}),
            Cell(storydoc.DISCLAIMER, "Second.", {"title": "Disclaimer"}),
            storydoc.chapter("One"),
            storydoc.markdown("prose"),
        )

        with zipfile.ZipFile(out) as z:
            names = z.namelist()
            opf = z.read("OEBPS/content.opf").decode("utf-8")

        self.assertIn("OEBPS/disclaimer.xhtml", names)
        self.assertIn("OEBPS/disclaimer_2.xhtml", names)
        self.assertEqual(opf.count('idref="disclaimer"'), 1)


def placed(root: Path, *cells: Cell, name: str = "story") -> Document:
    """A document on disk, so the cover art it points at can be looked for."""
    path = root / f"{name}{storydoc.EXTENSION}"
    storydoc.save(path, list(cells))
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
    return title_page(**said)


class WhatTheBindingCouldNotPrint(unittest.TestCase):
    """The judgements `read_book` already makes, now that it keeps them.

    Every one of these was decided while binding and thrown away: a book went out
    short of a section and said nothing about it.
    """

    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def wanting(self, *cells: Cell) -> dict[str, tuple[str, ...]]:
        book = read_book(placed(self.root, *cells))
        return {item.kind: item.needs for item in book.wanting}

    def test_a_cover_pointing_at_art_nobody_drew(self) -> None:
        # `_art_of` already returns None here and the page is silently dropped.
        said = self.wanting(Cell(storydoc.COVER, "", {"src": "cover.jpg"}))
        self.assertEqual(said[storydoc.COVER], (ART,))

    def test_a_cover_pointing_at_real_art_is_not_wanting(self) -> None:
        (self.root / "art.png").write_bytes(b"png")
        said = self.wanting(Cell(storydoc.COVER, "", {"src": "art.png"}))
        self.assertNotIn(storydoc.COVER, said)

    def test_a_title_page_nobody_filled_in(self) -> None:
        said = self.wanting(title_page(title="Untitled"))
        self.assertEqual(
            said[storydoc.TITLE_PAGE],
            ("title", "subtitle", "author", "publisher", "date"),
        )

    def test_it_names_only_the_fields_that_are_empty(self) -> None:
        said = self.wanting(filled_title_page(author="", date="   "))
        self.assertEqual(said[storydoc.TITLE_PAGE], ("author", "date"))

    def test_a_cover_whose_marker_and_markdown_disagree(self) -> None:
        # The author repointed the image and the attribute kept the name the
        # section was started with. The editor draws the markdown, so the book
        # has to find it there too rather than binding coverless in silence.
        (self.root / "real.png").write_bytes(b"png")
        said = self.wanting(
            Cell(storydoc.COVER, "![Cover](real.png)", {"src": "cover.jpg"})
        )
        self.assertNotIn(storydoc.COVER, said)

    def test_a_cover_whose_every_name_is_missing(self) -> None:
        said = self.wanting(
            Cell(storydoc.COVER, "![Cover](nope.png)", {"src": "cover.jpg"})
        )
        self.assertEqual(said[storydoc.COVER], (ART,))

    def test_a_version_is_never_wanted(self) -> None:
        # A fact about an edition, like an ISBN, not a thing a book waits for.
        said = self.wanting(filled_title_page(version=""))
        self.assertNotIn(storydoc.TITLE_PAGE, said)

    def test_an_isbn_is_never_wanted(self) -> None:
        # Many editions have none, so it is not a fact a book waits for.
        said = self.wanting(filled_title_page())
        self.assertNotIn(storydoc.TITLE_PAGE, said)

    def test_an_about_page_with_nothing_on_it(self) -> None:
        # `build_about_page` already answers None here.
        said = self.wanting(Cell(storydoc.ABOUT, ""))
        self.assertEqual(said[storydoc.ABOUT], (TEXT,))

    def test_an_about_page_with_only_a_link_is_written(self) -> None:
        said = self.wanting(Cell(storydoc.ABOUT, "", {"website": "https://x.com"}))
        self.assertNotIn(storydoc.ABOUT, said)

    def test_an_empty_blurb(self) -> None:
        said = self.wanting(Cell(storydoc.BLURB, ""))
        self.assertEqual(said[storydoc.BLURB], (TEXT,))

    def test_the_table_of_contents_is_never_wanting(self) -> None:
        # It is built from the chapters whatever the cell holds.
        said = self.wanting(storydoc.contents())
        self.assertNotIn(storydoc.CONTENTS, said)

    def test_a_section_that_is_not_there_wants_everything(self) -> None:
        said = self.wanting(storydoc.chapter("One"))
        self.assertEqual(said[storydoc.COVER], (ART,))
        self.assertEqual(said[storydoc.BLURB], (TEXT,))
        self.assertEqual(said[storydoc.ABOUT], (TEXT,))

    def test_a_disclaimer_is_not_a_section_the_book_requires(self) -> None:
        said = self.wanting(Cell(storydoc.DISCLAIMER, ""), storydoc.chapter("One"))
        self.assertNotIn(storydoc.DISCLAIMER, said)


class WhatStandsBetweenTheDocumentAndABook(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def test_a_bare_story_is_missing_all_five(self) -> None:
        found = report_of(placed(self.root, storydoc.chapter("One")))
        self.assertEqual(found.added, REQUIRED)
        self.assertFalse(found.ready)

    def test_the_plan_opens_and_closes_the_document(self) -> None:
        found = report_of(placed(self.root, storydoc.chapter("One")))
        self.assertEqual(
            [slot.kind for slot in found.plan],
            [*OPENING, storydoc.CHAPTER, *CLOSING],
        )

    def test_a_section_already_there_is_carried_by_index(self) -> None:
        found = report_of(
            placed(
                self.root,
                storydoc.chapter("One"),
                Cell(storydoc.COVER, "", {"src": "art.png"}),
            )
        )
        self.assertNotIn(storydoc.COVER, found.added)
        self.assertEqual(found.plan[0].at, 1)

    def test_the_story_keeps_the_order_it_was_written_in(self) -> None:
        found = report_of(
            placed(
                self.root,
                storydoc.chapter("One"),
                storydoc.markdown("The lantern."),
                storydoc.chapter("Two"),
            )
        )
        self.assertEqual([s.at for s in found.plan if s.at is not None], [0, 1, 2])

    def test_a_section_that_passed_the_story_has_moved(self) -> None:
        found = report_of(
            placed(self.root, storydoc.chapter("One"), storydoc.contents())
        )
        self.assertIn(storydoc.CONTENTS, found.moved)

    def test_writing_a_section_in_moves_nothing(self) -> None:
        # The about page is last before and last after; only its index changed.
        found = report_of(
            placed(
                self.root,
                storydoc.chapter("One"),
                Cell(storydoc.ABOUT, "I live by the sea."),
            )
        )
        self.assertEqual(found.moved, ())

    def test_a_front_matter_written_back_to_front_has_all_of_it_moved(self) -> None:
        (self.root / "art.png").write_bytes(b"png")
        found = report_of(
            placed(
                self.root,
                Cell(storydoc.ABOUT, "I live by the sea."),
                Cell(storydoc.BLURB, "A lantern, and a stair."),
                storydoc.contents(),
                filled_title_page(),
                Cell(storydoc.COVER, "", {"src": "art.png"}),
                storydoc.chapter("One"),
            )
        )
        self.assertEqual(found.added, ())
        self.assertEqual(found.moved, REQUIRED)

    def test_the_disclaimer_keeps_the_place_the_author_gave_it(self) -> None:
        found = report_of(
            placed(
                self.root,
                Cell(storydoc.DISCLAIMER, "All fiction."),
                storydoc.chapter("One"),
            )
        )
        self.assertEqual(
            [slot.kind for slot in found.plan],
            [*OPENING, storydoc.DISCLAIMER, storydoc.CHAPTER, *CLOSING],
        )

    def test_only_the_first_of_a_kind_is_claimed(self) -> None:
        found = report_of(
            placed(
                self.root,
                storydoc.chapter("One"),
                storydoc.contents(),
                storydoc.contents(),
            )
        )
        self.assertEqual(found.plan[2].at, 1)
        self.assertIn(2, [slot.at for slot in found.plan[4:]])

    def test_everything_present_and_one_of_them_empty_is_not_ready(self) -> None:
        (self.root / "art.png").write_bytes(b"png")
        found = report_of(
            placed(
                self.root,
                Cell(storydoc.COVER, "", {"src": "art.png"}),
                filled_title_page(),
                storydoc.contents(),
                Cell(storydoc.BLURB, ""),  # written in, never filled
                storydoc.chapter("One"),
                Cell(storydoc.ABOUT, "I live by the sea."),
            )
        )
        self.assertEqual(found.added, ())
        self.assertEqual(found.moved, ())
        self.assertFalse(found.ready)

    def test_a_document_with_everything_written_is_ready(self) -> None:
        (self.root / "art.png").write_bytes(b"png")
        found = report_of(
            placed(
                self.root,
                Cell(storydoc.COVER, "", {"src": "art.png"}),
                filled_title_page(),
                storydoc.contents(),
                Cell(storydoc.BLURB, "A lantern, and a stair."),
                storydoc.chapter("One"),
                Cell(storydoc.ABOUT, "I live by the sea."),
            )
        )
        self.assertTrue(found.ready)


if __name__ == "__main__":
    unittest.main()
