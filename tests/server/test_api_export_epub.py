from pathlib import Path
import tempfile
import unittest
import zipfile

from fastapi.testclient import TestClient

from server.api import app
from authordoc.storydoc import Document
from authordoc import storydoc
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB, BlurbCell
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.image_cell import ImageCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.table_of_contents_cell import (
    TABLE_OF_CONTENTS,
    TableOfContentsCell,
)
from authordoc.cells.title_page_cell import TITLE_PAGE, TitlePageCell


class ExportEpub(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.document = Path(self._dir.name) / f"story{storydoc.EXTENSION}"
        Document.from_cells(
            [
                TitlePageCell(title="Book"),
                ChapterCell("One"),
                MarkdownCell("prose"),
            ],
            self.document,
        ).save()

    def _ready(self) -> None:
        """Write the document out with every section a book needs filled in."""
        (Path(self._dir.name) / "art.png").write_bytes(b"png")
        Document.from_cells(
            [
                ImageCell("art.png"),
                TitlePageCell(title="Book", subtitle="A Story", author="A. Writer", publisher="A Press", date="2026-09-02"),
                TableOfContentsCell(),
                BlurbCell(source="A lantern, and a stair."),
                ChapterCell("One"),
                MarkdownCell("prose"),
                AboutCell(source="I live by the sea."),
            ],
            self.document,
        ).save()

    def test_writes_the_epub_beside_the_document(self) -> None:
        self._ready()
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ready"])

        written = Path(response.json()["path"])
        self.assertEqual(written, self.document.with_suffix(".epub"))
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))

    def test_a_document_that_is_not_ready_is_not_bound(self) -> None:
        # The document written in setUp has a title page and nothing else: no
        # blurb, no author page, and a title page with one field on it.
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        self.assertEqual(response.status_code, 200)

        said = response.json()
        self.assertFalse(said["ready"])
        self.assertIsNone(said["path"])
        self.assertFalse(self.document.with_suffix(".epub").exists())

    def test_it_says_what_is_missing_rather_than_only_refusing(self) -> None:
        client = TestClient(app)
        said = client.post(
            "/export/epub",
            json={"path": str(self.document), "text": self.document.read_text()},
        ).json()
        self.assertEqual(
            said["added"], [TABLE_OF_CONTENTS, BLURB, ABOUT]
        )
        wanting = {item["kind"]: item["needs"] for item in said["wanting"]}
        # The title page is there, in place, and still not filled in — which is
        # the fault a document can have while looking complete.
        self.assertEqual(
            wanting[TITLE_PAGE],
            ["subtitle", "author", "publisher", "date"],
        )

    def test_force_binds_a_book_that_is_not_ready(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={
                "path": str(self.document),
                "text": self.document.read_text(),
                "force": True,
            },
        )
        self.assertEqual(response.status_code, 200)

        said = response.json()
        self.assertFalse(said["ready"])
        written = Path(said["path"])
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))


if __name__ == "__main__":
    unittest.main()
