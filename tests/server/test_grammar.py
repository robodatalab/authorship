"""Tests for grammar fixing: which lines a pass covers, and what it leaves alone.

No model. `correct_span` takes its corrector by injection and only ever asks it
to `complete`, so a stand-in that uppercases what it is given drives the whole
path — what is under test is which prose reaches the model and how the answer is
put back, not the correcting itself.
"""

import unittest

from server.writing_tools.grammar import _prose_blocks, correct_span
from server.manuscript import Manuscript


class Uppercase:
    """A corrector whose answer is unmistakable in the manuscript."""

    def complete(self, instruction: str, text: str, max_new_tokens: int = 0) -> str:
        return text.upper()


class Recording:
    """A corrector that keeps everything it was asked to correct."""

    def __init__(self) -> None:
        self.asked: list[str] = []

    def complete(self, instruction: str, text: str, max_new_tokens: int = 0) -> str:
        self.asked.append(text)
        return text.upper()


MANUSCRIPT = "## One\n\nteh cat sat.\n\nit purred.\n\n## Two\n\nteh dog.\n"


class ProseBlocks(unittest.TestCase):
    """A paragraph at a time, and never a note."""

    def test_a_blank_line_ends_a_paragraph(self) -> None:
        manuscript = Manuscript(MANUSCRIPT)
        self.assertEqual(_prose_blocks(manuscript, 0, 8), [(2, 2), (4, 4), (8, 8)])

    def test_lines_running_together_are_one_paragraph(self) -> None:
        manuscript = Manuscript("## One\n\nteh cat sat.\nit purred.\n")
        self.assertEqual(_prose_blocks(manuscript, 0, 3), [(2, 3)])

    def test_a_note_is_not_a_paragraph(self) -> None:
        manuscript = Manuscript("## One\n\nteh cat sat.\n<!-- check -->\nteh dog.\n")
        self.assertEqual(_prose_blocks(manuscript, 0, 4), [(2, 2), (4, 4)])

    def test_only_the_lines_asked_for_are_covered(self) -> None:
        manuscript = Manuscript(MANUSCRIPT)
        self.assertEqual(_prose_blocks(manuscript, 4, 8), [(4, 4), (8, 8)])

    def test_a_section_heading_is_never_a_paragraph(self) -> None:
        manuscript = Manuscript(MANUSCRIPT)
        self.assertNotIn((6, 6), _prose_blocks(manuscript, 0, 8))


class CorrectSpan(unittest.TestCase):

    def test_corrects_the_span_and_leaves_the_rest_of_the_manuscript_alone(
        self,
    ) -> None:
        manuscript = Manuscript(MANUSCRIPT)
        correct_span(Uppercase(), manuscript, 8, 8)
        self.assertEqual(
            str(manuscript),
            "## One\n\nteh cat sat.\n\nit purred.\n\n## Two\n\nTEH DOG.\n",
        )

    def test_keeps_the_blank_line_between_the_paragraphs_it_corrects(self) -> None:
        manuscript = Manuscript(MANUSCRIPT)
        correct_span(Uppercase(), manuscript, 2, 4)
        self.assertEqual(
            str(manuscript),
            "## One\n\nTEH CAT SAT.\n\nIT PURRED.\n\n## Two\n\nteh dog.\n",
        )

    def test_a_manuscript_ending_without_a_newline_gains_none(self) -> None:
        manuscript = Manuscript("## One\nteh cat.")
        correct_span(Uppercase(), manuscript, 1, 1)
        self.assertEqual(str(manuscript), "## One\nTEH CAT.")

    def test_each_paragraph_is_asked_for_on_its_own(self) -> None:
        model = Recording()
        correct_span(model, Manuscript(MANUSCRIPT), 0, 8)
        self.assertEqual(
            sorted(model.asked), ["it purred.", "teh cat sat.", "teh dog."]
        )

    def test_lines_holding_no_prose_are_nothing_to_correct(self) -> None:
        with self.assertRaises(ValueError):
            correct_span(Uppercase(), Manuscript(MANUSCRIPT), 3, 3)

    def test_a_cancelled_pass_stops_asking(self) -> None:
        model = Recording()
        correct_span(model, Manuscript(MANUSCRIPT), 2, 4, lambda: True)
        self.assertEqual(model.asked, [])

    def test_a_correction_that_runs_long_does_not_disturb_what_is_left(self) -> None:
        # Blocks are corrected back to front, so a paragraph coming back as more
        # lines than it went in as cannot move the ones still to be corrected.
        class Doubling:
            def complete(
                self, instruction: str, text: str, max_new_tokens: int = 0
            ) -> str:
                return text.upper() + "\n" + text.upper()

        manuscript = Manuscript(MANUSCRIPT)
        correct_span(Doubling(), manuscript, 2, 4)
        self.assertEqual(
            str(manuscript),
            "## One\n\nTEH CAT SAT.\nTEH CAT SAT.\n\nIT PURRED.\nIT PURRED.\n"
            "\n## Two\n\nteh dog.\n",
        )


class Notes(unittest.TestCase):
    """A note to self is not the story, and a correction leaves it alone.

    The model answers whatever it is given with a sentence, so a note that
    reached it would come back as prose the author never wrote.
    """

    def test_a_note_between_paragraphs_comes_back_exactly_as_it_was(self) -> None:
        noted = "## One\n\nteh cat sat.\n\n<!-- check this -->\n\nit purred.\n"
        manuscript = Manuscript(noted)
        correct_span(Uppercase(), manuscript, 2, 6)
        self.assertEqual(
            str(manuscript),
            "## One\n\nTEH CAT SAT.\n\n<!-- check this -->\n\nIT PURRED.\n",
        )

    def test_a_note_spanning_lines_is_never_handed_over_in_halves(self) -> None:
        noted = (
            "## One\n\nteh cat sat.\n\n"
            "<!--\nnot yet:\n\nteh dog barked.\n-->\n\nit purred.\n"
        )
        model = Recording()
        manuscript = Manuscript(noted)
        correct_span(model, manuscript, 2, 10)
        self.assertEqual(sorted(model.asked), ["it purred.", "teh cat sat."])
        self.assertEqual(
            str(manuscript),
            "## One\n\nTEH CAT SAT.\n\n"
            "<!--\nnot yet:\n\nteh dog barked.\n-->\n\nIT PURRED.\n",
        )

    def test_a_note_never_closed_silences_the_rest_of_the_span(self) -> None:
        noted = "## One\n\nteh cat sat.\n\n<!-- from here on, notes\nteh dog.\n"
        manuscript = Manuscript(noted)
        correct_span(Uppercase(), manuscript, 2, 5)
        self.assertEqual(
            str(manuscript),
            "## One\n\nTEH CAT SAT.\n\n<!-- from here on, notes\nteh dog.\n",
        )


if __name__ == "__main__":
    unittest.main()
