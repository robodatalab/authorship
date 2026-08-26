"""Tests for correcting the style and grammar of a whole manuscript.

The pass is a fold over the chapters, like the blurb: each one goes to the model
with the chapters already corrected in front of it. What is under test is what
counts as a chapter, what the model is shown of the document and what it is not,
that a chapter comes back into the sections it went in as, and that a chapter
that cannot be put back is left alone.
"""

import unittest
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.writing_tools.style import (
    FIX_REQUEST,
    SEAM,
    STYLE_INSTRUCTION,
    THINKING_HEADROOM,
    chapters_of,
    fix_style,
)


def build_model(*replies: str) -> mock.MagicMock:
    """A model that answers with each reply in turn."""
    model = mock.MagicMock()
    model.complete.return_value = ONE_FIXED
    if replies:
        model.complete.side_effect = replies
    return model


# What a corrected chapter looks like coming back: about as long as it went in,
# and ending where a sentence ends. Stub answers of "A." used to do here, and
# every one of them is now refused — which is the point, since that is the shape
# a chapter cut off against the token ceiling arrives in.
FIRST_FIXED = "The lantern had gone out yet again."
SECOND_FIXED = "She did not relight it."
THIRD_FIXED = "The door was standing open."


def one_fixed(first: str = FIRST_FIXED, second: str = SECOND_FIXED) -> str:
    """The first chapter's two sections, corrected, with the seam between them."""
    return f"{first}\n\n{SEAM}\n\n{second}"


ONE_FIXED = one_fixed()


STORY = storydoc.dumps(
    [
        storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Veriona"}),
        storydoc.markdown("Front matter, about the book and not in it."),
        storydoc.chapter("The First Night"),
        storydoc.markdown("The lantern had gone out again."),
        storydoc.markdown("She did not light it."),
        storydoc.Cell(storydoc.NOTE, "Ask Mara whether this is the third time.", {}),
        storydoc.Cell(storydoc.CONTENTS, "1. The First Night", {}),
        storydoc.chapter("The Second"),
        storydoc.markdown("The door stood open."),
    ]
)


def collect(document: Document, model: mock.MagicMock) -> dict[int, str]:
    """Every section the pass handed back, by the cell it belongs to."""
    revised: dict[int, str] = {}
    fix_style(model, document, revised=lambda index, source: revised.update({index: source}))
    return revised


class ChaptersOf(unittest.TestCase):
    def test_a_chapter_holds_every_markdown_section_up_to_the_next_chapter(self) -> None:
        chapters = chapters_of(Document(STORY))
        self.assertEqual([c.title for c in chapters], ["The First Night", "The Second"])
        self.assertEqual(
            [s.source for s in chapters[0].sections],
            ["The lantern had gone out again.", "She did not light it."],
        )

    def test_what_stands_before_the_first_chapter_belongs_to_no_chapter(self) -> None:
        for chapter in chapters_of(Document(STORY)):
            for section in chapter.sections:
                self.assertNotIn("Front matter", section.source)

    def test_only_the_markdown_is_the_story(self) -> None:
        sources = [
            section.source
            for chapter in chapters_of(Document(STORY))
            for section in chapter.sections
        ]
        self.assertNotIn("Ask Mara whether this is the third time.", sources)
        self.assertNotIn("1. The First Night", sources)

    def test_a_section_points_at_the_cell_it_came_from(self) -> None:
        chapters = chapters_of(Document(STORY))
        cells = Document(STORY).cells
        for chapter in chapters:
            for section in chapter.sections:
                self.assertEqual(cells[section.index].source, section.source)

    def test_a_chapter_with_nothing_written_under_it_is_not_one(self) -> None:
        empty = storydoc.dumps([storydoc.chapter("Unwritten")])
        self.assertEqual(chapters_of(Document(empty)), [])


class FixStyle(unittest.TestCase):
    def test_corrects_one_chapter_at_a_time(self) -> None:
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY))
        self.assertEqual(model.complete.call_count, 2)

    def test_asks_as_the_instruction_and_names_what_it_wants_in_the_turn(self) -> None:
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY))
        instruction, said, _ceiling = model.complete.call_args_list[0].args
        self.assertEqual(instruction, STYLE_INSTRUCTION)
        self.assertIn(FIX_REQUEST, said)
        self.assertIn("The First Night", said)
        self.assertIn("The lantern had gone out again.", said)

    def test_the_sections_of_a_chapter_go_with_a_seam_between_them(self) -> None:
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY))
        said = model.complete.call_args_list[0].args[1]
        self.assertIn(f"The lantern had gone out again.\n\n{SEAM}\n\nShe did not light it.", said)

    def test_every_chapter_after_the_first_is_read_with_the_corrected_ones(self) -> None:
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY))
        first, second = (call.args[1] for call in model.complete.call_args_list)
        self.assertNotIn(FIRST_FIXED, first)
        self.assertIn(FIRST_FIXED, second)
        self.assertIn(SECOND_FIXED, second)
        # The corrected text, not the draft it replaced.
        self.assertNotIn("The lantern had gone out again.", second)
        self.assertIn("The door stood open.", second)

    def test_a_carried_chapter_carries_no_seams(self) -> None:
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY))
        second = model.complete.call_args_list[1].args[1]
        self.assertEqual(second.count(SEAM), 0)

    def test_the_notes_and_the_built_sections_are_never_read(self) -> None:
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertNotIn("Ask Mara", call.args[1])
            self.assertNotIn("Front matter", call.args[1])

    def test_hands_back_each_corrected_section_against_its_own_cell(self) -> None:
        document = Document(STORY)
        model = build_model(one_fixed(), THIRD_FIXED)
        self.assertEqual(collect(document, model), {3: FIRST_FIXED, 4: SECOND_FIXED, 8: THIRD_FIXED})

    def test_a_section_that_came_back_unchanged_is_not_handed_back(self) -> None:
        document = Document(STORY)
        model = build_model(
            one_fixed("The lantern had gone out again."), THIRD_FIXED
        )
        self.assertEqual(collect(document, model), {4: SECOND_FIXED, 8: THIRD_FIXED})

    def test_a_chapter_whose_seams_did_not_come_back_is_left_alone(self) -> None:
        document = Document(STORY)
        model = build_model("The lantern had gone out; she did not light it.", THIRD_FIXED)
        self.assertEqual(collect(document, model), {8: THIRD_FIXED})

    def test_a_chapter_left_alone_is_carried_on_as_the_author_wrote_it(self) -> None:
        model = build_model("The lantern had gone out; she did not light it.", THIRD_FIXED)
        fix_style(model, Document(STORY))
        second = model.complete.call_args_list[1].args[1]
        self.assertIn("The lantern had gone out again.", second)
        self.assertNotIn("she did not light it.", second)

    def test_takes_the_answer_out_of_a_code_fence(self) -> None:
        document = Document(STORY)
        model = build_model(f"```markdown\n{one_fixed()}\n```", THIRD_FIXED)
        self.assertEqual(collect(document, model), {3: FIRST_FIXED, 4: SECOND_FIXED, 8: THIRD_FIXED})

    def test_takes_off_a_heading_that_only_says_what_the_chapter_is_called(self) -> None:
        document = Document(STORY)
        model = build_model(f"# The First Night\n\n{one_fixed()}", THIRD_FIXED)
        self.assertEqual(collect(document, model), {3: FIRST_FIXED, 4: SECOND_FIXED, 8: THIRD_FIXED})

    def test_leaves_a_heading_the_author_would_have_written(self) -> None:
        document = Document(STORY)
        model = build_model(f"# Somewhere else\n\n{one_fixed()}", THIRD_FIXED)
        self.assertEqual(
            collect(document, model),
            {
                3: f"# Somewhere else\n\n{FIRST_FIXED}",
                4: SECOND_FIXED,
                8: THIRD_FIXED,
            },
        )

    def test_gives_the_model_the_token_ceiling_it_cannot_generate_without(self) -> None:
        # A model running on this machine takes the ceiling as an argument rather
        # than as an option, so it is always passed — and it is room over the
        # chapter's own length rather than a fixed number, since a chapter that
        # comes back truncated is one that cannot be put back at all.
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertGreaterEqual(call.args[2], THINKING_HEADROOM)
            self.assertGreaterEqual(call.args[2], len(call.args[1]) - len(FIX_REQUEST))

    def test_a_chapter_cut_off_mid_sentence_never_reaches_the_document(self) -> None:
        # The bug this class of check exists for. A model that runs out of room
        # answers with the opening of the right chapter: correctly written, the
        # right number of sections, and missing everything after it. It read as
        # a corrected chapter and replaced one.
        document = Document(STORY)
        model = build_model(
            one_fixed(second='She reached for the matches and said, "Come closer'),
            THIRD_FIXED,
        )
        self.assertEqual(collect(document, model), {8: THIRD_FIXED})

    def test_a_chapter_that_came_back_far_shorter_is_refused(self) -> None:
        # Copy-editing is not summarising, so a chapter at a third of its length
        # is not a tightened chapter — it is a piece of one.
        document = Document(STORY)
        model = build_model(one_fixed("Dark.", "Still."), THIRD_FIXED)
        self.assertEqual(collect(document, model), {8: THIRD_FIXED})

    def test_a_chapter_that_came_back_far_longer_is_refused(self) -> None:
        # The other way a model stops copy-editing and starts writing.
        document = Document(STORY)
        model = build_model(one_fixed(FIRST_FIXED, "She did not relight it. " * 12), THIRD_FIXED)
        self.assertEqual(collect(document, model), {8: THIRD_FIXED})

    def test_a_chapter_ending_on_a_closing_quote_is_finished(self) -> None:
        # Dialogue ends on the quote mark rather than the full stop inside it,
        # and refusing that would refuse most chapters ever written.
        document = Document(STORY)
        ended = 'She did not light it. "Not tonight."'
        model = build_model(one_fixed(FIRST_FIXED, ended), THIRD_FIXED)
        self.assertEqual(
            collect(document, model), {3: FIRST_FIXED, 4: ended, 8: THIRD_FIXED}
        )

    def test_a_real_correction_of_about_the_same_length_is_let_through(self) -> None:
        # The checks are about shape, and must not stand in the way of editing.
        document = Document(STORY)
        self.assertEqual(
            collect(document, build_model(one_fixed(), THIRD_FIXED)),
            {3: FIRST_FIXED, 4: SECOND_FIXED, 8: THIRD_FIXED},
        )

    def test_says_how_far_it_has_read_before_it_starts_and_after_each_chapter(self) -> None:
        seen: list[tuple[int, int]] = []
        model = build_model(one_fixed(), THIRD_FIXED)
        fix_style(model, Document(STORY), progress=lambda *reached: seen.append(reached))
        self.assertEqual(seen, [(0, 2), (1, 2), (2, 2)])

    def test_a_job_told_to_stop_reads_no_further(self) -> None:
        model = build_model(one_fixed(), THIRD_FIXED)
        stop = [False]
        revised: dict[int, str] = {}
        fix_style(
            model,
            Document(STORY),
            cancelled=lambda: stop[0],
            progress=lambda *_: stop.__setitem__(0, True),
            revised=lambda index, source: revised.update({index: source}),
        )
        # Stopped before it read anything: the first `progress` call is the total.
        self.assertEqual(model.complete.call_count, 0)
        self.assertEqual(revised, {})

    def test_an_answer_the_model_could_not_finish_costs_one_chapter_not_the_pass(
        self,
    ) -> None:
        # A novel is dozens of chapters, and losing the rest of them because one
        # ran out of room would be a poor trade.
        class Truncated(RuntimeError):
            one_chapter = True

        model = build_model()
        model.complete.side_effect = [Truncated("ran out of room"), THIRD_FIXED]
        revised: dict[int, str] = {}
        told: list[tuple[str, str]] = []
        fix_style(
            model,
            Document(STORY),
            revised=lambda index, source: revised.update({index: source}),
            left_alone=lambda title, why: told.append((title, why)),
        )
        self.assertEqual(revised, {8: THIRD_FIXED})
        self.assertEqual(told, [("The First Night", "ran out of room")])

    def test_a_chapter_the_model_would_not_read_costs_one_chapter_too(self) -> None:
        # A filter that refused chapter three says nothing about chapter four.
        class Refused(RuntimeError):
            one_chapter = True

        model = build_model()
        model.complete.side_effect = [
            Refused("Google would not read this chapter"),
            THIRD_FIXED,
        ]
        told: list[tuple[str, str]] = []
        fix_style(
            model,
            Document(STORY),
            left_alone=lambda title, why: told.append((title, why)),
        )
        self.assertEqual(told, [("The First Night", "Google would not read this chapter")])

    def test_a_failure_that_is_not_about_the_chapter_ends_the_pass(self) -> None:
        # A key, a quota or a network is not something the next chapter will do
        # any better at, and carrying on would be forty identical failures.
        model = build_model()
        model.complete.side_effect = RuntimeError("Gemini refused (401)")
        with self.assertRaises(RuntimeError):
            fix_style(model, Document(STORY))

    def test_says_which_chapters_it_left_alone_and_why(self) -> None:
        told: list[tuple[str, str]] = []
        model = build_model(
            one_fixed(second='and she said, "Come closer'), THIRD_FIXED
        )
        fix_style(
            model,
            Document(STORY),
            left_alone=lambda title, why: told.append((title, why)),
        )
        self.assertEqual(len(told), 1)
        self.assertEqual(told[0][0], "The First Night")
        self.assertIn("mid-sentence", told[0][1])

    def test_a_document_with_no_chapters_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            fix_style(build_model(), Document(storydoc.dumps([storydoc.markdown("a")])))


if __name__ == "__main__":
    unittest.main()
