import unittest
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.models.gemini import GeminiError
from server.writing_tools.style import (
    FIX_REQUEST,
    STYLE_INSTRUCTION,
    THINKING_HEADROOM,
    fix_style,
)

FRONT = "Front matter, about the book and not in it."
FIRST = "The lantern had gone out again."
SECOND = "She did not light it."
THIRD = "The door stood open."

FRONT_FIXED = "Front matter, about the book but not in it."
FIRST_FIXED = "The lantern had gone out yet again."
SECOND_FIXED = "She did not relight it."
THIRD_FIXED = "The door was standing open."

FIXED = (FRONT_FIXED, FIRST_FIXED, SECOND_FIXED, THIRD_FIXED)

FRONT_CELL_ID = "front"
FIRST_CELL_ID = "lantern"
SECOND_CELL_ID = "unlit"
THIRD_CELL_ID = "door"

ALL_FIXED = {
    FRONT_CELL_ID: FRONT_FIXED,
    FIRST_CELL_ID: FIRST_FIXED,
    SECOND_CELL_ID: SECOND_FIXED,
    THIRD_CELL_ID: THIRD_FIXED,
}


def build_model(*replies: str) -> mock.MagicMock:
    model = mock.MagicMock()
    model.complete.side_effect = replies or FIXED
    return model


def markdown(source: str, cell_id: str) -> storydoc.Cell:
    return storydoc.Cell(storydoc.MARKDOWN, source, {"id": cell_id})


STORY = storydoc.dumps(
    [
        storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Veriona"}),
        markdown(FRONT, FRONT_CELL_ID),
        storydoc.chapter("The First Night"),
        markdown(FIRST, FIRST_CELL_ID),
        markdown(SECOND, SECOND_CELL_ID),
        storydoc.Cell(storydoc.NOTE, "Ask Mara whether this is the third time.", {}),
        storydoc.Cell(storydoc.CONTENTS, "1. The First Night", {}),
        storydoc.chapter("The Second"),
        markdown(THIRD, THIRD_CELL_ID),
    ]
)


def collect(model: mock.MagicMock) -> dict[str, str]:
    revised: dict[str, str] = {}
    fix_style(
        model,
        Document(STORY),
        revised=lambda cell_id, source: revised.update({cell_id: source}),
    )
    return revised


def left_alone_by(model: mock.MagicMock) -> list[tuple[str, str]]:
    told: list[tuple[str, str]] = []
    fix_style(
        model,
        Document(STORY),
        left_alone=lambda opening, why: told.append((opening, why)),
    )
    return told


class FixStyle(unittest.TestCase):
    def test_corrects_one_section_at_a_time(self) -> None:
        model = build_model()
        fix_style(model, Document(STORY))
        self.assertEqual(model.complete.call_count, 4)

    def test_asks_as_the_instruction_and_names_what_it_wants_in_the_turn(self) -> None:
        model = build_model()
        fix_style(model, Document(STORY))
        instruction, said, _ceiling = model.complete.call_args_list[1].args
        self.assertEqual(instruction, STYLE_INSTRUCTION)
        self.assertIn(FIX_REQUEST, said)
        self.assertIn(FIRST, said)

    def test_every_section_after_the_first_is_read_with_the_corrected_ones(self) -> None:
        model = build_model()
        fix_style(model, Document(STORY))
        first, second, third, _fourth = (
            call.args[1] for call in model.complete.call_args_list
        )
        self.assertNotIn(FRONT_FIXED, first)
        self.assertIn(FRONT_FIXED, second)
        self.assertNotIn(FRONT, second)
        self.assertIn(FIRST_FIXED, third)

    def test_the_notes_and_the_built_sections_are_never_read(self) -> None:
        model = build_model()
        fix_style(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertNotIn("Ask Mara", call.args[1])
            self.assertNotIn("1. The First Night", call.args[1])

    def test_hands_back_each_corrected_section_against_its_own_cell(self) -> None:
        self.assertEqual(collect(build_model()), ALL_FIXED)

    def test_a_section_that_came_back_unchanged_is_not_handed_back(self) -> None:
        model = build_model(FRONT, FIRST_FIXED, SECOND_FIXED, THIRD_FIXED)
        self.assertEqual(
            collect(model),
            {
                FIRST_CELL_ID: FIRST_FIXED,
                SECOND_CELL_ID: SECOND_FIXED,
                THIRD_CELL_ID: THIRD_FIXED,
            },
        )

    def test_takes_the_answer_out_of_a_code_fence(self) -> None:
        model = build_model(
            f"```markdown\n{FRONT_FIXED}\n```", FIRST_FIXED, SECOND_FIXED, THIRD_FIXED
        )
        self.assertEqual(collect(model), ALL_FIXED)

    def test_gives_the_model_the_token_ceiling_it_cannot_generate_without(self) -> None:
        model = build_model()
        fix_style(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertGreaterEqual(call.args[2], THINKING_HEADROOM)

    def test_a_section_cut_off_mid_sentence_never_reaches_the_document(self) -> None:
        model = build_model(
            FRONT_FIXED,
            'She reached for the matches and said, "Come closer',
            SECOND_FIXED,
            THIRD_FIXED,
        )
        self.assertEqual(
            collect(model),
            {
                FRONT_CELL_ID: FRONT_FIXED,
                SECOND_CELL_ID: SECOND_FIXED,
                THIRD_CELL_ID: THIRD_FIXED,
            },
        )

    def test_a_section_that_came_back_far_shorter_is_refused(self) -> None:
        model = build_model(FRONT_FIXED, "Dark.", SECOND_FIXED, THIRD_FIXED)
        self.assertNotIn(FIRST_CELL_ID, collect(model))

    def test_a_section_that_came_back_far_longer_is_refused(self) -> None:
        model = build_model(
            FRONT_FIXED, FIRST_FIXED * 12, SECOND_FIXED, THIRD_FIXED
        )
        self.assertNotIn(FIRST_CELL_ID, collect(model))

    def test_a_section_ending_on_a_closing_quote_is_finished(self) -> None:
        ended = 'She did not light it. "Not tonight."'
        model = build_model(FRONT_FIXED, FIRST_FIXED, ended, THIRD_FIXED)
        self.assertEqual(collect(model)[SECOND_CELL_ID], ended)

    def test_a_section_left_alone_is_carried_on_as_the_author_wrote_it(self) -> None:
        model = build_model(
            FRONT_FIXED, "Dark.", SECOND_FIXED, THIRD_FIXED
        )
        fix_style(model, Document(STORY))
        third = model.complete.call_args_list[2].args[1]
        self.assertIn(FIRST, third)
        self.assertNotIn("Dark.", third)

    def test_says_how_far_it_has_read_before_it_starts_and_after_each_section(
        self,
    ) -> None:
        seen: list[tuple[int, int]] = []
        fix_style(
            build_model(), Document(STORY), progress=lambda *reached: seen.append(reached)
        )
        self.assertEqual(seen, [(0, 4), (1, 4), (2, 4), (3, 4), (4, 4)])

    def test_a_job_told_to_stop_reads_no_further(self) -> None:
        model = build_model()
        stop = [False]
        revised: dict[str, str] = {}
        fix_style(
            model,
            Document(STORY),
            cancelled=lambda: stop[0],
            progress=lambda *_: stop.__setitem__(0, True),
            revised=lambda cell_id, source: revised.update({cell_id: source}),
        )
        self.assertEqual(model.complete.call_count, 0)
        self.assertEqual(revised, {})

    def test_an_answer_the_model_could_not_finish_costs_one_section_not_the_pass(
        self,
    ) -> None:
        model = build_model()
        model.complete.side_effect = [
            FRONT_FIXED,
            GeminiError("ran out of room", truncated=True),
            SECOND_FIXED,
            THIRD_FIXED,
        ]
        told: list[tuple[str, str]] = []
        revised: dict[str, str] = {}
        fix_style(
            model,
            Document(STORY),
            revised=lambda cell_id, source: revised.update({cell_id: source}),
            left_alone=lambda opening, why: told.append((opening, why)),
        )
        self.assertNotIn(FIRST_CELL_ID, revised)
        self.assertEqual(told, [("The lantern had gone out", "ran out of room")])

    def test_a_section_the_model_would_not_read_costs_one_section_too(self) -> None:
        model = build_model()
        model.complete.side_effect = [
            FRONT_FIXED,
            GeminiError("Google would not read this", refused=True),
            SECOND_FIXED,
            THIRD_FIXED,
        ]
        self.assertEqual(
            left_alone_by(model),
            [("The lantern had gone out", "Google would not read this")],
        )

    def test_a_failure_that_is_not_about_the_section_ends_the_pass(self) -> None:
        model = build_model()
        model.complete.side_effect = RuntimeError("Gemini refused (401)")
        with self.assertRaises(RuntimeError):
            fix_style(model, Document(STORY))

    def test_says_which_sections_it_left_alone_and_why(self) -> None:
        model = build_model(
            FRONT_FIXED,
            'and she said, "Come closer',
            SECOND_FIXED,
            THIRD_FIXED,
        )
        told = left_alone_by(model)
        self.assertEqual(len(told), 1)
        self.assertEqual(told[0][0], "The lantern had gone out")
        self.assertIn("mid-sentence", told[0][1])

    def test_a_document_with_no_prose_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            fix_style(build_model(), Document(storydoc.dumps([storydoc.chapter("One")])))


if __name__ == "__main__":
    unittest.main()
