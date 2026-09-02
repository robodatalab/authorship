"""Tests for writing the story so far out of the volumes before this one.

The blurb's near relation, and the same fold over chapters — so what is under
test here is what it does that a blurb does not: reading several documents in the
order they are handed over, naming the volume each chapter came from, and
counting the chapters of all of them as one length.
"""

import unittest
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.writing_tools.recap import RECAP_INSTRUCTION, write_recap


def build_model(*replies: str) -> mock.MagicMock:
    """A model that answers with each reply in turn, and refuses a turn too many."""
    model = mock.MagicMock()
    model.complete.return_value = "She has lost her name."
    if replies:
        model.complete.side_effect = replies
    return model


def volume(title: str, *chapters: tuple[str, str]) -> Document:
    cells = [storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": title})]
    for name, prose in chapters:
        cells.append(storydoc.chapter(name))
        cells.append(storydoc.markdown(prose))
    return Document(storydoc.dumps(cells))


FIRST = volume(
    "Veriona",
    ("The First Night", "The lantern had gone out again."),
    ("The Second", "The door stood open."),
)
SECOND = volume("Veriona II", ("The Road", "She walked until the road ended."))


class WriteRecap(unittest.TestCase):
    def test_reads_every_chapter_of_every_volume_and_answers_with_the_last(
        self,
    ) -> None:
        model = build_model("After one.", "After two.", "After three.")
        self.assertEqual(write_recap(model, [FIRST, SECOND]), "After three.")
        self.assertEqual(model.complete.call_count, 3)

    def test_asks_as_the_instruction_and_shows_the_chapter_as_the_turn(self) -> None:
        model = build_model()
        write_recap(model, [FIRST])
        system, user = model.complete.call_args_list[0].args
        self.assertEqual(system, RECAP_INSTRUCTION)
        self.assertIn("The First Night", user)
        self.assertIn("The lantern had gone out again.", user)

    def test_every_chapter_after_the_first_is_read_with_the_recap_so_far(self) -> None:
        model = build_model("After one.", "After two.", "After three.")
        write_recap(model, [FIRST, SECOND])
        first, second, third = (
            call.args[1] for call in model.complete.call_args_list
        )
        self.assertNotIn("After one.", first)
        self.assertIn("After one.", second)
        self.assertIn("After two.", third)
        self.assertIn("She walked until the road ended.", third)

    def test_the_volumes_are_read_in_the_order_they_are_handed_over(self) -> None:
        # The order is the caller's answer, and it is the order the story
        # happened in — not the order the chapters were found on disk.
        model = build_model()
        write_recap(model, [SECOND, FIRST])
        self.assertIn("She walked until the road ended.", model.complete.call_args_list[0].args[1])
        self.assertIn("The lantern had gone out again.", model.complete.call_args_list[1].args[1])

    def test_each_chapter_is_named_by_the_volume_it_came_out_of(self) -> None:
        # Which book a chapter is from is a fact about that chapter, and the
        # model cannot see the turn it was told it in.
        model = build_model()
        write_recap(model, [FIRST, SECOND])
        self.assertIn("Veriona", model.complete.call_args_list[0].args[1])
        self.assertIn("Veriona II", model.complete.call_args_list[2].args[1])

    def test_the_author_s_notes_are_not_the_story(self) -> None:
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("One"),
                    storydoc.markdown(
                        "The lantern had gone out again.\n"
                        "<!-- ask Mara whether this is the third time -->\n"
                        "She did not light it."
                    ),
                ]
            )
        )
        model = build_model()
        write_recap(model, [document])
        self.assertNotIn("ask Mara", model.complete.call_args_list[0].args[1])

    def test_what_an_earlier_volume_says_about_itself_is_not_the_story(self) -> None:
        # A blurb, a note or a recap of its own: every one of them is written
        # about the book rather than in it, and none is what happened.
        document = Document(
            storydoc.dumps(
                [
                    storydoc.Cell(storydoc.RECAP, "What happened before that."),
                    storydoc.markdown("Front matter, about the book and not in it."),
                    storydoc.chapter("One"),
                    storydoc.markdown("The door stood open."),
                    storydoc.Cell(storydoc.BLURB, "The copy that sells it."),
                    storydoc.Cell(storydoc.CONTENTS, "1. One"),
                ]
            )
        )
        model = build_model()
        write_recap(model, [document])
        said = model.complete.call_args_list[0].args[1]
        self.assertNotIn("What happened before that.", said)
        self.assertNotIn("Front matter", said)
        self.assertNotIn("The copy that sells it.", said)
        self.assertNotIn("1. One", said)

    def test_the_breaks_between_paragraphs_survive(self) -> None:
        document = Document(
            storydoc.dumps(
                [storydoc.chapter("One"), storydoc.markdown("The lantern.\n\nThe door.")]
            )
        )
        model = build_model()
        write_recap(model, [document])
        self.assertIn(
            "The lantern.\n\nThe door.", model.complete.call_args_list[0].args[1]
        )

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
        write_recap(model, [document])
        self.assertEqual(model.complete.call_count, 1)

    def test_the_recap_comes_back_without_the_whitespace_around_it(self) -> None:
        model = build_model("  After one.  ", "\n  She has lost her name.\n\n")
        self.assertEqual(
            write_recap(model, [FIRST]), "She has lost her name."
        )

    def test_documents_with_no_story_in_them_have_nothing_to_summarise(self) -> None:
        empty = Document(
            storydoc.dumps([storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "V"})])
        )
        with self.assertRaises(ValueError):
            write_recap(build_model(), [empty])

    def test_nothing_to_read_at_all_has_nothing_to_summarise(self) -> None:
        with self.assertRaises(ValueError):
            write_recap(build_model(), [])

    def test_the_length_of_the_story_is_told_before_the_first_chapter_is_read(
        self,
    ) -> None:
        # The bar has to have a length before it has anything to fill it with,
        # and its length is every chapter of every volume rather than one book's.
        seen: list[tuple[int, int]] = []
        write_recap(
            build_model(),
            [FIRST, SECOND],
            progress=lambda *counts: seen.append(counts),
        )
        self.assertEqual(seen, [(0, 3), (1, 3), (2, 3), (3, 3)])

    def test_a_cancelled_job_stops_between_chapters_and_answers_with_nothing(
        self,
    ) -> None:
        # Nothing rather than the story as far as it had got: what comes back
        # goes into the author's document.
        model = build_model("After one.", "After two.", "After three.")
        written = write_recap(
            model, [FIRST, SECOND], lambda: model.complete.call_count >= 1
        )
        self.assertEqual(written, "")
        self.assertEqual(model.complete.call_count, 1)

    def test_a_cancelled_job_stops_counting_where_it_stopped_reading(self) -> None:
        model = build_model("After one.", "After two.", "After three.")
        seen: list[tuple[int, int]] = []
        write_recap(
            model,
            [FIRST, SECOND],
            lambda: model.complete.call_count >= 1,
            lambda *counts: seen.append(counts),
        )
        self.assertEqual(seen, [(0, 3), (1, 3)])

    def test_a_job_cancelled_before_it_starts_never_reaches_the_model(self) -> None:
        model = build_model()
        self.assertEqual(write_recap(model, [FIRST], lambda: True), "")
        model.complete.assert_not_called()


if __name__ == "__main__":
    unittest.main()
