"""Tests for grammar fixing: which lines a pass covers, and what it leaves alone.

No model. `correct_span` takes its corrector by injection and only ever asks it
to `complete`, so a stand-in that uppercases what it is given drives the whole
path — what is under test is which prose reaches the model and how the answer is
put back, not the correcting itself.
"""

import unittest

from server.grammar import Span, correct_span, section_span, selected_span


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


class SectionSpan(unittest.TestCase):
    def test_covers_the_prose_under_the_heading_but_not_the_heading(self) -> None:
        self.assertEqual(section_span(MANUSCRIPT, 2), Span(start=2, end=4))

    def test_reads_a_cursor_on_the_heading_as_the_section_it_opens(self) -> None:
        self.assertEqual(section_span(MANUSCRIPT, 0), Span(start=2, end=4))

    def test_the_last_section_runs_to_the_end_of_the_manuscript(self) -> None:
        self.assertEqual(section_span(MANUSCRIPT, 8), Span(start=8, end=8))

    def test_a_section_with_nothing_under_it_is_no_span_at_all(self) -> None:
        self.assertIsNone(section_span("## One\n\n", 0))

    def test_a_line_past_the_end_falls_in_no_section(self) -> None:
        self.assertIsNone(section_span(MANUSCRIPT, 99))


class SelectedSpan(unittest.TestCase):
    def test_is_the_lines_the_author_picked_out(self) -> None:
        self.assertEqual(selected_span(MANUSCRIPT, 2, 4), Span(start=2, end=4))

    def test_leaves_out_the_blank_lines_at_either_end(self) -> None:
        self.assertEqual(selected_span(MANUSCRIPT, 1, 5), Span(start=2, end=4))

    def test_a_selection_of_blank_lines_is_no_span_at_all(self) -> None:
        self.assertIsNone(selected_span(MANUSCRIPT, 3, 3))

    def test_a_selection_running_past_the_end_stops_at_the_last_line(self) -> None:
        self.assertEqual(selected_span(MANUSCRIPT, 8, 99), Span(start=8, end=8))


class CorrectSpan(unittest.TestCase):
    def test_corrects_the_span_and_leaves_the_rest_of_the_manuscript_alone(
        self,
    ) -> None:
        corrected = correct_span(Uppercase(), MANUSCRIPT, Span(start=8, end=8))
        self.assertEqual(
            corrected,
            "## One\n\nteh cat sat.\n\nit purred.\n\n## Two\n\nTEH DOG.\n",
        )

    def test_keeps_the_blank_line_between_the_span_and_what_follows(self) -> None:
        corrected = correct_span(Uppercase(), MANUSCRIPT, Span(start=2, end=4))
        self.assertEqual(
            corrected,
            "## One\n\nTEH CAT SAT.\n\nIT PURRED.\n\n## Two\n\nteh dog.\n",
        )

    def test_a_manuscript_ending_without_a_newline_gains_none(self) -> None:
        corrected = correct_span(Uppercase(), "teh cat.", Span(start=0, end=0))
        self.assertEqual(corrected, "TEH CAT.")

    def test_a_cancelled_pass_stops_asking(self) -> None:
        asked: list[str] = []

        class Counting:
            def complete(
                self, instruction: str, text: str, max_new_tokens: int = 0
            ) -> str:
                asked.append(text)
                return text.upper()

        correct_span(Counting(), MANUSCRIPT, Span(start=2, end=4), lambda: True)
        self.assertEqual(asked, [])


class Notes(unittest.TestCase):
    """A note to self is not the story, and a correction leaves it alone.

    The model answers whatever it is given with a sentence, so a note that
    reached it would come back as prose the author never wrote — which is why
    what is asserted here is as much what the model is asked as what lands in the
    manuscript.
    """

    def test_a_note_between_paragraphs_comes_back_exactly_as_it_was(self) -> None:
        noted = "## One\n\nteh cat sat.\n\n<!-- check this -->\n\nit purred.\n"
        corrected = correct_span(Uppercase(), noted, Span(start=2, end=6))
        self.assertEqual(
            corrected,
            "## One\n\nTEH CAT SAT.\n\n<!-- check this -->\n\nIT PURRED.\n",
        )

    def test_a_note_spanning_blank_lines_is_never_handed_over_in_halves(self) -> None:
        noted = (
            "## One\n\nteh cat sat.\n\n"
            "<!--\nnot yet:\n\nteh dog barked.\n-->\n\nit purred.\n"
        )
        model = Recording()
        corrected = correct_span(model, noted, Span(start=2, end=10))
        self.assertEqual(model.asked, ["teh cat sat.", "it purred."])
        self.assertEqual(
            corrected,
            "## One\n\nTEH CAT SAT.\n\n"
            "<!--\nnot yet:\n\nteh dog barked.\n-->\n\nIT PURRED.\n",
        )

    def test_a_note_beside_prose_keeps_the_space_it_was_sitting_in(self) -> None:
        corrected = correct_span(
            Uppercase(), "teh cat sat. <!-- check -->\n", Span(start=0, end=0)
        )
        self.assertEqual(corrected, "TEH CAT SAT. <!-- check -->\n")

    def test_a_note_never_closed_silences_the_rest_of_the_span(self) -> None:
        noted = "teh cat sat.\n\n<!-- from here on, notes\nteh dog.\n"
        corrected = correct_span(Uppercase(), noted, Span(start=0, end=3))
        self.assertEqual(
            corrected, "TEH CAT SAT.\n\n<!-- from here on, notes\nteh dog.\n"
        )

    def test_a_selection_beginning_partway_through_a_note_leaves_the_rest_of_it(
        self,
    ) -> None:
        noted = "<!-- a note\nabout the cat\n-->\n\nteh cat sat.\n"
        model = Recording()
        corrected = correct_span(model, noted, Span(start=1, end=4))
        self.assertEqual(model.asked, ["teh cat sat."])
        self.assertEqual(corrected, "<!-- a note\nabout the cat\n-->\n\nTEH CAT SAT.\n")

    def test_nothing_carrying_a_note_marker_ever_reaches_the_model(self) -> None:
        noted = (
            "teh cat sat. <!-- inline -->\n\n"
            "<!-- alone -->\n\n"
            "it purred.\n\n"
            "<!--\nover\nseveral lines\n-->\n\n"
            "teh dog.\n"
        )
        model = Recording()
        correct_span(model, noted, Span(start=0, end=11))
        self.assertEqual(model.asked, ["teh cat sat.", "it purred.", "teh dog."])
