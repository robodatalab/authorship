"""Tests for writing a story's blurb.

The writing itself is a stub, so what is under test is the contract around it —
that it reads the document it was given, that it answers with text, and that a
cancelled job stops rather than answering anyway.
"""

import unittest

from server import storydoc
from server.storydoc import Document
from server.writing_tools.blurb import write_blurb


DOCUMENT = storydoc.dumps(
    [
        storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Veriona"}),
        storydoc.chapter("One"),
        storydoc.markdown("prose"),
        storydoc.chapter("Two"),
        storydoc.markdown("more"),
    ]
)


class WriteBlurb(unittest.TestCase):
    def test_writes_about_the_document_it_was_given(self) -> None:
        written = write_blurb(Document(DOCUMENT))
        self.assertIn("Veriona", written)
        self.assertIn("2 chapters", written)

    def test_a_book_of_one_chapter_is_not_two(self) -> None:
        document = Document(
            storydoc.dumps([storydoc.chapter("One"), storydoc.markdown("prose")])
        )
        self.assertIn("1 chapter)", write_blurb(document))

    def test_says_it_is_not_the_real_thing(self) -> None:
        # A stub that reads as a finished blurb is one an author ships.
        self.assertIn("stub", write_blurb(Document(DOCUMENT)))

    def test_a_cancelled_job_writes_nothing(self) -> None:
        self.assertEqual(write_blurb(Document(DOCUMENT), lambda: True), "")


if __name__ == "__main__":
    unittest.main()
