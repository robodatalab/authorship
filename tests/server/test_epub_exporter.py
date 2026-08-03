import tempfile
import unittest
import zipfile
from pathlib import Path

from server.epub_exporter import (
    _inline,
    blocks_to_xhtml,
    build_epub,
    chapters_of,
)
from server.manuscript import Manuscript


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
    def test_a_chapter_per_heading(self) -> None:
        chapters = chapters_of(Manuscript("## One\n\na\n\n## Two\n\nb\n"))
        self.assertEqual([c.title for c in chapters], ["One", "Two"])

    def test_front_matter_before_the_first_heading_keeps_the_books_title(self) -> None:
        chapters = chapters_of(Manuscript("# Book\n\nintro\n\n## One\n\nprose\n"))
        # The lead-in keeps the book's title; the heading opens the next chapter.
        self.assertEqual([c.title for c in chapters], ["Book", "One"])

    def test_a_manuscript_with_no_headings_is_one_chapter(self) -> None:
        chapters = chapters_of(Manuscript("just some prose\nand more\n"))
        self.assertEqual(len(chapters), 1)
        self.assertEqual(chapters[0].idx, 0)

    def test_chapters_are_numbered_in_order(self) -> None:
        chapters = chapters_of(Manuscript("## A\n\nx\n\n## B\n\ny\n"))
        self.assertEqual(
            [c.filename for c in chapters],
            ["chap_000.xhtml", "chap_001.xhtml"],
        )



class BuildEpub(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.root = Path(self._dir.name)

    def _build(
        self,
        md_text: str,
        *,
        cover: Path | None = None,
        name: str = "story",
    ) -> Path:
        md_path = self.root / f"{name}.md"
        md_path.write_text(md_text, encoding="utf-8")
        out_path = self.root / f"{name}.epub"
        build_epub(Manuscript.load(md_path), out_path, cover, None, "A. Writer", "en")
        return out_path

    def test_writes_a_zip_with_the_epub_skeleton(self) -> None:
        out = self._build("# Book\n\n## One\n\nprose\n\n## Two\n\nmore\n")

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
        out = self._build("## One\n\nprose\n")

        with zipfile.ZipFile(out) as z:
            first = z.infolist()[0]
            # The reader finds the media type by reading this entry raw, so it must
            # lead and must not be compressed.
            self.assertEqual(first.filename, "mimetype")
            self.assertEqual(first.compress_type, zipfile.ZIP_STORED)

    def test_one_xhtml_per_chapter(self) -> None:
        out = self._build("## One\n\na\n\n## Two\n\nb\n\n## Three\n\nc\n")

        with zipfile.ZipFile(out) as z:
            chapters = [n for n in z.namelist() if n.startswith("OEBPS/chap_")]
        self.assertEqual(len(chapters), 3)

    def test_a_cover_is_embedded_only_when_one_is_given(self) -> None:
        without = self._build("## One\n\nprose\n", name="plain")
        with zipfile.ZipFile(without) as z:
            self.assertNotIn("OEBPS/cover.xhtml", z.namelist())

        cover = self.root / "cover.png"
        cover.write_bytes(b"\x89PNG\r\n\x1a\n not really a png")
        with_cover = self._build("## One\n\nprose\n", cover=cover, name="dressed")
        with zipfile.ZipFile(with_cover) as z:
            names = z.namelist()
            self.assertIn("OEBPS/cover.xhtml", names)
            self.assertIn("OEBPS/cover.png", names)


if __name__ == "__main__":
    unittest.main()
