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
    CHAPTER_HEADROOM,
    FIX_REQUEST,
    SEAM,
    STYLE_INSTRUCTION,
    chapters_of,
    fix_style,
)


def build_model(*replies: str) -> mock.MagicMock:
    """A model that answers with each reply in turn."""
    model = mock.MagicMock()
    model.complete.return_value = "Corrected."
    if replies:
        model.complete.side_effect = replies
    return model


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
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY))
        self.assertEqual(model.complete.call_count, 2)

    def test_asks_as_the_instruction_and_names_what_it_wants_in_the_turn(self) -> None:
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY))
        instruction, said, _ceiling = model.complete.call_args_list[0].args
        self.assertEqual(instruction, STYLE_INSTRUCTION)
        self.assertIn(FIX_REQUEST, said)
        self.assertIn("The First Night", said)
        self.assertIn("The lantern had gone out again.", said)

    def test_the_sections_of_a_chapter_go_with_a_seam_between_them(self) -> None:
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY))
        said = model.complete.call_args_list[0].args[1]
        self.assertIn(f"The lantern had gone out again.\n\n{SEAM}\n\nShe did not light it.", said)

    def test_every_chapter_after_the_first_is_read_with_the_corrected_ones(self) -> None:
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY))
        first, second = (call.args[1] for call in model.complete.call_args_list)
        self.assertNotIn("A.", first)
        self.assertIn("A.", second)
        self.assertIn("B.", second)
        # The corrected text, not the draft it replaced.
        self.assertNotIn("The lantern had gone out again.", second)
        self.assertIn("The door stood open.", second)

    def test_a_carried_chapter_carries_no_seams(self) -> None:
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY))
        second = model.complete.call_args_list[1].args[1]
        self.assertEqual(second.count(SEAM), 0)

    def test_the_notes_and_the_built_sections_are_never_read(self) -> None:
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertNotIn("Ask Mara", call.args[1])
            self.assertNotIn("Front matter", call.args[1])

    def test_hands_back_each_corrected_section_against_its_own_cell(self) -> None:
        document = Document(STORY)
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        self.assertEqual(collect(document, model), {3: "A.", 4: "B.", 8: "C."})

    def test_a_section_that_came_back_unchanged_is_not_handed_back(self) -> None:
        document = Document(STORY)
        model = build_model(
            f"The lantern had gone out again.\n\n{SEAM}\n\nB.", "C."
        )
        self.assertEqual(collect(document, model), {4: "B.", 8: "C."})

    def test_a_chapter_whose_seams_did_not_come_back_is_left_alone(self) -> None:
        document = Document(STORY)
        model = build_model("A. B. — the two sections run together.", "C.")
        self.assertEqual(collect(document, model), {8: "C."})

    def test_a_chapter_left_alone_is_carried_on_as_the_author_wrote_it(self) -> None:
        model = build_model("Run together.", "C.")
        fix_style(model, Document(STORY))
        second = model.complete.call_args_list[1].args[1]
        self.assertIn("The lantern had gone out again.", second)
        self.assertNotIn("Run together.", second)

    def test_takes_the_answer_out_of_a_code_fence(self) -> None:
        document = Document(STORY)
        model = build_model(f"```markdown\nA.\n\n{SEAM}\n\nB.\n```", "C.")
        self.assertEqual(collect(document, model), {3: "A.", 4: "B.", 8: "C."})

    def test_takes_off_a_heading_that_only_says_what_the_chapter_is_called(self) -> None:
        document = Document(STORY)
        model = build_model(f"# The First Night\n\nA.\n\n{SEAM}\n\nB.", "C.")
        self.assertEqual(collect(document, model), {3: "A.", 4: "B.", 8: "C."})

    def test_leaves_a_heading_the_author_would_have_written(self) -> None:
        document = Document(STORY)
        model = build_model(f"# Somewhere else\n\nA.\n\n{SEAM}\n\nB.", "C.")
        self.assertEqual(
            collect(document, model),
            {3: "# Somewhere else\n\nA.", 4: "B.", 8: "C."},
        )

    def test_gives_the_model_the_token_ceiling_it_cannot_generate_without(self) -> None:
        # A model running on this machine takes the ceiling as an argument rather
        # than as an option, so it is always passed — and it is room over the
        # chapter's own length rather than a fixed number, since a chapter that
        # comes back truncated is one that cannot be put back at all.
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertGreaterEqual(call.args[2], CHAPTER_HEADROOM)
            self.assertGreaterEqual(call.args[2], len(call.args[1]) - len(FIX_REQUEST))

    def test_says_how_far_it_has_read_before_it_starts_and_after_each_chapter(self) -> None:
        seen: list[tuple[int, int]] = []
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
        fix_style(model, Document(STORY), progress=lambda *reached: seen.append(reached))
        self.assertEqual(seen, [(0, 2), (1, 2), (2, 2)])

    def test_a_job_told_to_stop_reads_no_further(self) -> None:
        model = build_model(f"A.\n\n{SEAM}\n\nB.", "C.")
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

    def test_a_document_with_no_chapters_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            fix_style(build_model(), Document(storydoc.dumps([storydoc.markdown("a")])))


if __name__ == "__main__":
    unittest.main()
