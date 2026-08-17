import json
import tempfile
import unittest
from pathlib import Path

from server import storydoc
from server.storydoc import Cell

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
        written = storydoc.dumps([storydoc.chapter("One", "Prose.")])
        self.assertEqual(written, '<!-- cell: chapter title="One" -->\n\nProse.\n')

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


class OnDisk(unittest.TestCase):
    def test_a_document_survives_being_saved_and_loaded(self) -> None:
        cells = [storydoc.cover("c.jpg"), storydoc.chapter("One", "Prose.")]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / f"story{storydoc.EXTENSION}"
            storydoc.save(path, cells)
            self.assertEqual(storydoc.load(path), cells)


if __name__ == "__main__":
    unittest.main()
