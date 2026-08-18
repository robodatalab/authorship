"""Tests for writing a story's blurb.

The writing is a fold over the chapters: each one goes to the model with the
blurb the chapters before it earned, and the last answer is the blurb. What is
under test is what the model is shown of the document and what it is not, what
the caller is told while it runs, and that a job asked to stop stops.
"""

import unittest
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.writing_tools.blurb import BLURB_INSTRUCTION, write_blurb


def build_model(*replies: str) -> mock.MagicMock:
    """A model that answers with each reply in turn, and refuses a turn too many."""
    model = mock.MagicMock()
    model.complete.return_value = "A woman loses her name."
    if replies:
        model.complete.side_effect = replies
    return model


STORY = storydoc.dumps(
    [
        storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Veriona"}),
        storydoc.markdown("Front matter, about the book and not in it."),
        storydoc.chapter("The First Night"),
        storydoc.markdown(
            "The lantern had gone out again.\n"
            "<!-- ask Mara whether this is the third time -->\n"
            "She did not light it."
        ),
        storydoc.Cell(storydoc.CONTENTS, "1. The First Night", {}),
        storydoc.chapter("The Second"),
        storydoc.markdown("The door stood open."),
    ]
)


class WriteBlurb(unittest.TestCase):
    def test_writes_one_blurb_for_each_chapter_and_answers_with_the_last(self) -> None:
        model = build_model("After the first.", "After the second.")
        self.assertEqual(
            write_blurb(model, Document(STORY)), "After the second."
        )
        self.assertEqual(model.complete.call_count, 2)

    def test_asks_as_the_instruction_and_shows_the_chapter_as_the_turn(self) -> None:
        model = build_model()
        write_blurb(model, Document(STORY))
        system, user = model.complete.call_args_list[0].args
        self.assertEqual(system, BLURB_INSTRUCTION)
        self.assertIn("The First Night", user)
        self.assertIn("The lantern had gone out again.", user)

    def test_every_chapter_after_the_first_is_read_with_the_blurb_so_far(self) -> None:
        model = build_model("After the first.", "After the second.")
        write_blurb(model, Document(STORY))
        first = model.complete.call_args_list[0].args[1]
        second = model.complete.call_args_list[1].args[1]
        self.assertNotIn("After the first.", first)
        self.assertIn("After the first.", second)
        self.assertIn("The door stood open.", second)

    def test_the_book_is_named_by_its_title_page(self) -> None:
        model = build_model()
        write_blurb(model, Document(STORY))
        self.assertIn("Veriona", model.complete.call_args_list[0].args[1])

    def test_the_author_s_notes_are_not_the_story(self) -> None:
        model = build_model()
        write_blurb(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertNotIn("ask Mara", call.args[1])

    def test_what_stands_before_the_first_chapter_is_not_read(self) -> None:
        model = build_model()
        write_blurb(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertNotIn("Front matter", call.args[1])

    def test_a_table_of_contents_is_written_rather_than_told(self) -> None:
        model = build_model()
        write_blurb(model, Document(STORY))
        for call in model.complete.call_args_list:
            self.assertNotIn("1. The First Night", call.args[1])

    def test_a_blurb_already_in_the_document_is_not_read_back(self) -> None:
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("One"),
                    storydoc.markdown("The door stood open."),
                    storydoc.Cell(storydoc.BLURB, "The last thing this wrote.", {}),
                ]
            )
        )
        model = build_model()
        write_blurb(model, document)
        self.assertNotIn(
            "The last thing this wrote.", model.complete.call_args_list[0].args[1]
        )

    def test_the_breaks_between_paragraphs_survive(self) -> None:
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("One"),
                    storydoc.markdown("The lantern.\n\nThe door."),
                ]
            )
        )
        model = build_model()
        write_blurb(model, document)
        self.assertIn("The lantern.\n\nThe door.", model.complete.call_args_list[0].args[1])

    def test_a_chapter_with_nothing_written_under_it_is_not_read(self) -> None:
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("One"),
                    storydoc.markdown("The door stood open."),
                    storydoc.chapter("Two"),
                ]
            )
        )
        model = build_model()
        write_blurb(model, document)
        self.assertEqual(model.complete.call_count, 1)

    def test_an_untitled_chapter_is_named_by_its_number(self) -> None:
        document = Document(
            storydoc.dumps(
                [storydoc.chapter(""), storydoc.markdown("The door stood open.")]
            )
        )
        model = build_model()
        write_blurb(model, document)
        self.assertIn("Chapter 1", model.complete.call_args_list[0].args[1])

    def test_the_blurb_comes_back_without_the_whitespace_around_it(self) -> None:
        model = build_model("  After the first.  ", "\n  A woman loses her name.\n\n")
        self.assertEqual(
            write_blurb(model, Document(STORY)), "A woman loses her name."
        )

    def test_a_document_with_no_chapters_has_nothing_to_write_about(self) -> None:
        document = Document(
            storydoc.dumps([storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "V"})])
        )
        with self.assertRaises(ValueError):
            write_blurb(build_model(), document)

    def test_the_length_of_the_book_is_told_before_the_first_chapter_is_read(
        self,
    ) -> None:
        # The bar has to have a length before it has anything to fill it with:
        # the first chapter is the longest wait of the job.
        seen: list[tuple[int, int]] = []
        write_blurb(
            build_model(), Document(STORY), progress=lambda *counts: seen.append(counts)
        )
        self.assertEqual(seen, [(0, 2), (1, 2), (2, 2)])

    def test_a_cancelled_job_stops_between_chapters_and_answers_with_nothing(
        self,
    ) -> None:
        # Nothing rather than the blurb for half the book: what comes back goes
        # into the author's document.
        model = build_model("After the first.", "After the second.")
        written = write_blurb(
            model, Document(STORY), lambda: model.complete.call_count >= 1
        )
        self.assertEqual(written, "")
        self.assertEqual(model.complete.call_count, 1)

    def test_a_cancelled_job_stops_counting_where_it_stopped_reading(self) -> None:
        model = build_model("After the first.", "After the second.")
        seen: list[tuple[int, int]] = []
        write_blurb(
            model,
            Document(STORY),
            lambda: model.complete.call_count >= 1,
            lambda *counts: seen.append(counts),
        )
        self.assertEqual(seen, [(0, 2), (1, 2)])

    def test_a_job_cancelled_before_it_starts_never_reaches_the_model(self) -> None:
        model = build_model()
        self.assertEqual(write_blurb(model, Document(STORY), lambda: True), "")
        model.complete.assert_not_called()


if __name__ == "__main__":
    unittest.main()
