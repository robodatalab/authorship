import json
import tempfile
import unittest
from pathlib import Path

from server import storydoc
from server.storydoc import Cell, Document

CORPUS = json.loads(
    (Path(__file__).parents[1] / "storydoc_corpus.json").read_text(encoding="utf-8")
)


class Corpus(unittest.TestCase):
    def test_every_document_reads_as_the_corpus_says(self) -> None:
        # The same file drives the TypeScript tests, so a rule added in one
        # language cannot quietly go unimplemented in the other.
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                expected = [
                    Cell(c["kind"], c["source"], c["attrs"]) for c in case["cells"]
                ]
                self.assertEqual(storydoc.parse(case["text"]), expected)

    def test_every_document_is_written_back_byte_for_byte(self) -> None:
        # Round-tripping through this library alone would let the two
        # implementations drift apart while both stayed self-consistent, so the
        # corpus pins the bytes rather than the behaviour.
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                written = storydoc.dumps(storydoc.parse(case["text"]))
                self.assertEqual(written, case["dumped"])

    def test_every_document_survives_a_round_trip(self) -> None:
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                cells = storydoc.parse(case["text"])
                self.assertEqual(storydoc.parse(storydoc.dumps(cells)), cells)


class Writing(unittest.TestCase):
    def test_a_cell_is_written_as_a_marker_and_its_text(self) -> None:
        written = storydoc.dumps([storydoc.markdown("Prose.")])
        self.assertEqual(written, "<!-- cell: markdown -->\n\nProse.\n")

    def test_a_chapter_is_written_as_its_marker_alone(self) -> None:
        # A chapter names a place in the book; the prose under it is its own cell.
        written = storydoc.dumps([storydoc.chapter("One")])
        self.assertEqual(written, '<!-- cell: chapter title="One" -->\n')

    def test_a_part_is_written_as_its_marker_alone(self) -> None:
        # A part names a division of the story; the chapters under it are their
        # own cells, exactly as the prose under a chapter is.
        written = storydoc.dumps([storydoc.part("Book One")])
        self.assertEqual(written, '<!-- cell: part title="Book One" -->\n')

    def test_an_unprinted_part_says_it_prints_nothing(self) -> None:
        # The seam an author cuts the files at: a part in every way but the page
        # the reader would otherwise turn to.
        written = storydoc.dumps([storydoc.part("Break", printed=False)])
        self.assertEqual(written, '<!-- cell: part title="Break" print="no" -->\n')

    def test_whether_a_part_prints_survives_the_round_trip(self) -> None:
        back = storydoc.parse(storydoc.dumps([storydoc.part("Break", printed=False)]))
        self.assertFalse(storydoc.prints_page(back[0]))

    def test_a_part_that_says_nothing_about_printing_prints(self) -> None:
        # Every part written before there was anything to say about it.
        self.assertTrue(storydoc.prints_page(storydoc.part("Book One")))
        self.assertTrue(storydoc.prints_page(Cell(storydoc.PART, "", {})))

    def test_a_cell_with_no_text_is_written_as_its_marker_alone(self) -> None:
        self.assertEqual(storydoc.dumps([storydoc.contents()]), "<!-- cell: contents -->\n")

    def test_an_unknown_kind_is_written_back_as_it_was_read(self) -> None:
        text = '<!-- cell: epigraph attribution="Anon" -->\n\nA line.\n'
        self.assertEqual(storydoc.dumps(storydoc.parse(text)), text)

    def test_a_quote_in_an_attribute_is_escaped_on_the_way_out(self) -> None:
        written = storydoc.dumps([storydoc.chapter('She said "no"')])
        self.assertIn('title="She said \\"no\\""', written)


class Asking(unittest.TestCase):
    def test_has_finds_a_kind_the_document_carries(self) -> None:
        cells = [storydoc.chapter("One"), storydoc.contents()]
        self.assertTrue(storydoc.has(cells, storydoc.CONTENTS))
        self.assertFalse(storydoc.has(cells, storydoc.COVER))

    def test_cells_of_returns_every_cell_of_a_kind_in_order(self) -> None:
        cells = [storydoc.chapter("One"), storydoc.contents(), storydoc.chapter("Two")]
        self.assertEqual(
            [cell.title for cell in storydoc.cells_of(cells, storydoc.CHAPTER)],
            ["One", "Two"],
        )

    def test_a_cell_is_known_by_its_kind_and_not_by_its_title(self) -> None:
        # The whole reason a cell carries a kind: a chapter the author named
        # "Disclaimer" is a chapter.
        cells = [storydoc.chapter("Disclaimer")]
        self.assertFalse(storydoc.has(cells, storydoc.DISCLAIMER))
        self.assertTrue(storydoc.has(cells, storydoc.CHAPTER))


class Preparing(unittest.TestCase):
    def test_missing_cells_are_added_in_order(self) -> None:
        prepared = storydoc.add_missing(
            [storydoc.chapter("One")], [storydoc.contents(), storydoc.cover("c.jpg")]
        )
        self.assertEqual(
            [cell.kind for cell in prepared], ["chapter", "contents", "cover"]
        )

    def test_preparing_twice_adds_nothing_the_second_time(self) -> None:
        wanted = [storydoc.contents(), storydoc.cover("c.jpg")]
        once = storydoc.add_missing([storydoc.chapter("One")], wanted)
        twice = storydoc.add_missing(once, wanted)
        self.assertEqual(once, twice)

    def test_a_cell_the_author_has_edited_is_left_alone(self) -> None:
        mine = Cell(storydoc.CONTENTS, "My own contents.")
        prepared = storydoc.add_missing([mine], [storydoc.contents()])
        self.assertEqual(prepared, [mine])


class Chapters(unittest.TestCase):
    def test_each_chapter_carries_the_prose_written_under_it(self) -> None:
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("One"),
                    storydoc.markdown("The door stood open."),
                    storydoc.chapter("Two"),
                    storydoc.markdown("It closed."),
                ]
            )
        )
        self.assertEqual(
            document.chapters,
            [("One", "The door stood open."), ("Two", "It closed.")],
        )

    def test_a_part_divides_the_chapters_without_being_one(self) -> None:
        # A part names a run of chapters and carries no prose, so it is neither a
        # chapter of its own nor something falling into the one before it.
        document = Document(
            storydoc.dumps(
                [
                    storydoc.part("Day One"),
                    storydoc.chapter("One"),
                    storydoc.markdown("The door stood open."),
                    storydoc.part("Day Two"),
                    storydoc.chapter("Two"),
                    storydoc.markdown("It closed."),
                ]
            )
        )
        self.assertEqual(
            document.chapters,
            [("One", "The door stood open."), ("Two", "It closed.")],
        )


class OnDisk(unittest.TestCase):
    def test_a_document_survives_being_saved_and_loaded(self) -> None:
        cells = [storydoc.cover("c.jpg"), storydoc.chapter("One")]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / f"story{storydoc.EXTENSION}"
            storydoc.save(path, cells)
            self.assertEqual(storydoc.load(path), cells)


if __name__ == "__main__":
    unittest.main()
