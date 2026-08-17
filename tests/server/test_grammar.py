"""Tests for grammar fixing: which lines a pass covers, and what it leaves alone.

No model. `correct_span` takes its corrector by injection and only ever asks it
to `complete`, so a stand-in that uppercases what it is given drives the whole
path — what is under test is which prose reaches the model and how the answer is
put back, not the correcting itself.

The documents are built through `dumps` rather than written out by hand, so a
change to how the format is written cannot leave these testing a layout that no
longer exists.
"""

import unittest

from server import storydoc
from server.storydoc import Document
from server.writing_tools.grammar import _prose_blocks, correct_span


class Uppercase:
    """A corrector whose answer is unmistakable in the document."""

    def complete(self, instruction: str, text: str, max_new_tokens: int = 0) -> str:
        return text.upper()


class Recording:
    """A corrector that keeps everything it was asked to correct."""

    def __init__(self) -> None:
        self.asked: list[str] = []

    def complete(self, instruction: str, text: str, max_new_tokens: int = 0) -> str:
        self.asked.append(text)
        return text.upper()


# Laid out as:  0 chapter   2 markdown  4 'teh cat sat.'  6 'it purred.'
#               8 chapter  10 markdown 12 'teh dog.'
DOCUMENT = storydoc.dumps(
    [
        storydoc.chapter("One"),
        storydoc.markdown("teh cat sat.\n\nit purred."),
        storydoc.chapter("Two"),
        storydoc.markdown("teh dog."),
    ]
)
WHOLE = len(Document(DOCUMENT).lines) - 1


class ProseBlocks(unittest.TestCase):
    """A paragraph at a time, and never a marker or a note."""

    def test_a_blank_line_ends_a_paragraph(self) -> None:
        document = Document(DOCUMENT)
        self.assertEqual(
            _prose_blocks(document, 0, WHOLE), [(4, 4), (6, 6), (12, 12)]
        )

    def test_lines_running_together_are_one_paragraph(self) -> None:
        document = Document(
            storydoc.dumps([storydoc.markdown("teh cat sat.\nit purred.")])
        )
        self.assertEqual(_prose_blocks(document, 0, 4), [(2, 3)])

    def test_a_note_is_not_a_paragraph(self) -> None:
        document = Document(
            storydoc.dumps(
                [storydoc.markdown("teh cat.\n\n<!-- fix later -->\n\nit sat.")]
            )
        )
        self.assertEqual(_prose_blocks(document, 0, 8), [(2, 2), (6, 6)])

    def test_a_cell_marker_is_never_a_paragraph(self) -> None:
        # The markers are what the structure is written in. A pass that corrected
        # one would be asking the model to rewrite the document's shape.
        document = Document(DOCUMENT)
        covered = {
            line
            for first, last in _prose_blocks(document, 0, WHOLE)
            for line in range(first, last + 1)
        }
        self.assertEqual(covered, {4, 6, 12})

    def test_only_the_lines_asked_for_are_covered(self) -> None:
        document = Document(DOCUMENT)
        self.assertEqual(_prose_blocks(document, 6, WHOLE), [(6, 6), (12, 12)])

    def test_a_built_cell_is_never_corrected(self) -> None:
        # A table of contents disagreeing with the chapters is the one thing it
        # must not do, and a model asked to improve it would see to that.
        document = Document(
            storydoc.dumps(
                [storydoc.Cell("contents", "1. One"), storydoc.markdown("a b.")]
            )
        )
        blocks = _prose_blocks(document, 0, len(document.lines) - 1)
        self.assertEqual([document.lines[first] for first, _ in blocks], ["a b."])


class CorrectSpan(unittest.TestCase):
    def test_corrects_the_span_and_leaves_the_rest_alone(self) -> None:
        document = Document(DOCUMENT)
        correct_span(Uppercase(), document, 4, 6)
        self.assertIn("TEH CAT SAT.", str(document))
        self.assertIn("IT PURRED.", str(document))
        self.assertIn("teh dog.", str(document))

    def test_leaves_every_cell_marker_where_it_was(self) -> None:
        document = Document(DOCUMENT)
        correct_span(Uppercase(), document, 0, WHOLE)
        self.assertIn('<!-- cell: chapter title="One" -->', str(document))
        self.assertIn('<!-- cell: chapter title="Two" -->', str(document))
        self.assertIn("<!-- cell: markdown -->", str(document))

    def test_the_document_still_reads_as_the_same_cells(self) -> None:
        document = Document(DOCUMENT)
        correct_span(Uppercase(), document, 0, WHOLE)
        self.assertEqual(
            [(cell.kind, cell.title) for cell in document.cells],
            [
                ("chapter", "One"),
                ("markdown", ""),
                ("chapter", "Two"),
                ("markdown", ""),
            ],
        )

    def test_keeps_the_blank_line_between_the_paragraphs_it_corrects(self) -> None:
        document = Document(DOCUMENT)
        correct_span(Uppercase(), document, 4, 6)
        self.assertIn("TEH CAT SAT.\n\nIT PURRED.", str(document))

    def test_each_paragraph_is_asked_for_on_its_own(self) -> None:
        model = Recording()
        correct_span(model, Document(DOCUMENT), 0, WHOLE)
        self.assertEqual(sorted(model.asked), ["it purred.", "teh cat sat.", "teh dog."])

    def test_a_note_is_never_handed_to_the_model(self) -> None:
        model = Recording()
        document = Document(
            storydoc.dumps(
                [storydoc.markdown("teh cat.\n\n<!-- fix later -->\n\nit sat.")]
            )
        )
        correct_span(model, document, 0, len(document.lines) - 1)
        self.assertEqual(sorted(model.asked), ["it sat.", "teh cat."])
        self.assertIn("<!-- fix later -->", str(document))

    def test_a_correction_that_runs_long_does_not_disturb_what_is_left(self) -> None:
        class Doubling:
            def complete(
                self, instruction: str, text: str, max_new_tokens: int = 0
            ) -> str:
                return f"{text.upper()}\n{text.upper()}"

        document = Document(DOCUMENT)
        correct_span(Doubling(), document, 4, 6)
        self.assertIn("TEH CAT SAT.\nTEH CAT SAT.", str(document))
        self.assertIn("IT PURRED.\nIT PURRED.", str(document))

    def test_a_cancelled_pass_stops_asking(self) -> None:
        model = Recording()
        correct_span(model, Document(DOCUMENT), 4, 6, lambda: True)
        self.assertEqual(model.asked, [])

    def test_a_document_with_no_prose_at_all_is_refused(self) -> None:
        document = Document(storydoc.dumps([storydoc.chapter("One")]))
        with self.assertRaises(ValueError):
            correct_span(Uppercase(), document, 0, len(document.lines) - 1)

    def test_a_document_ending_without_a_newline_gains_none(self) -> None:
        document = Document(DOCUMENT.rstrip("\n"))
        correct_span(Uppercase(), document, 4, 4)
        self.assertFalse(str(document).endswith("\n"))


if __name__ == "__main__":
    unittest.main()
