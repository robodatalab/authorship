"""Tests for writing the story so far out of the volumes before this one.

Two passes: every chapter is read on its own, and the recap is written out of
what came back. So what is under test is that every chapter really is read, that
the volumes are read in the order they are handed over and named by the volume
they came from, and — the reason the fold this replaced was thrown away — that no
chapter is ever shown an answer the model has already written.
"""

import unittest
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.writing_tools.recap import write_recap


def build_model(*replies: str) -> mock.MagicMock:
    """A model that answers with each reply in turn, and refuses a turn too many."""
    model = mock.MagicMock()
    model.complete.return_value = "She has lost her name."
    if replies:
        model.complete.side_effect = replies
    return model


def turns(model: mock.MagicMock) -> list[str]:
    """What the model was shown, turn by turn."""
    return [call.args[1] for call in model.complete.call_args_list]


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
    def test_reads_every_chapter_of_every_volume_and_then_writes_the_recap(
        self,
    ) -> None:
        model = build_model("After one.", "After two.", "After three.", "All of it.")
        self.assertEqual(write_recap(model, [FIRST, SECOND]), "All of it.")
        # Three chapters, and the turn that reads what they came to.
        self.assertEqual(model.complete.call_count, 4)

    def test_no_chapter_is_shown_an_answer_the_model_has_already_written(self) -> None:
        # The fold this replaced put its own last answer in every turn after the
        # first, and a model asked to write a finished piece of prose again with
        # that prose in front of it hands it straight back — so the chapter was
        # read and thrown away. Nothing written may reach the turn that reads a
        # chapter.
        model = build_model("After one.", "After two.", "After three.", "All of it.")
        write_recap(model, [FIRST, SECOND])
        for said in turns(model)[:3]:
            self.assertNotIn("After one.", said)
            self.assertNotIn("After two.", said)
            self.assertNotIn("After three.", said)

    def test_the_recap_is_written_from_the_notes_and_not_from_the_book(self) -> None:
        # The prose itself never reaches the last turn. That is what keeps it one
        # turn long whether the serial is three chapters or ninety.
        model = build_model("After one.", "After two.", "After three.", "All of it.")
        write_recap(model, [FIRST, SECOND])
        said = turns(model)[-1]
        self.assertNotIn("The lantern had gone out again.", said)
        self.assertNotIn("She walked until the road ended.", said)

    def test_the_volumes_are_read_in_the_order_they_are_handed_over(self) -> None:
        # The order is the caller's answer, and it is the order the story
        # happened in — not the order the chapters were found on disk.
        model = build_model()
        write_recap(model, [SECOND, FIRST])
        self.assertIn("She walked until the road ended.", turns(model)[0])
        self.assertIn("The lantern had gone out again.", turns(model)[1])

    def test_the_notes_stand_in_the_order_the_chapters_were_read(self) -> None:
        model = build_model("After one.", "After two.", "After three.", "All of it.")
        write_recap(model, [FIRST, SECOND])
        said = turns(model)[-1]
        self.assertLess(said.index("After one."), said.index("After two."))
        self.assertLess(said.index("After two."), said.index("After three."))

    def test_each_chapter_is_named_by_the_volume_it_came_out_of(self) -> None:
        # Which book a chapter is from is a fact about that chapter, and the
        # chapter is read in a turn of its own.
        model = build_model()
        write_recap(model, [FIRST, SECOND])
        self.assertIn("Veriona", turns(model)[0])
        self.assertIn("Veriona II", turns(model)[2])

    def test_the_notes_are_gathered_under_the_volume_they_came_out_of(self) -> None:
        model = build_model("After one.", "After two.", "After three.", "All of it.")
        write_recap(model, [FIRST, SECOND])
        said = turns(model)[-1]
        self.assertIn('From "Veriona"', said)
        self.assertIn('From "Veriona II"', said)
        self.assertLess(said.index('From "Veriona II"'), said.index("After three."))

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
        self.assertNotIn("ask Mara", turns(model)[0])

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
        said = turns(model)[0]
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
        self.assertIn("The lantern.\n\nThe door.", turns(model)[0])

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
        # The one chapter that has prose under it, and the recap.
        self.assertEqual(model.complete.call_count, 2)

    def test_the_recap_comes_back_without_the_whitespace_around_it(self) -> None:
        model = build_model(
            "  After one.  ", " After two. ", "\n  She has lost her name.\n\n"
        )
        self.assertEqual(write_recap(model, [FIRST]), "She has lost her name.")

    def test_a_note_is_kept_without_the_whitespace_around_it(self) -> None:
        model = build_model("  After one.  ", " After two. ", "All of it.")
        write_recap(model, [FIRST])
        said = turns(model)[-1]
        self.assertIn("The First Night — After one.", said)
        self.assertIn("The Second — After two.", said)

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
        # It stands full while the recap itself is written.
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
        model = build_model("After one.", "After two.", "After three.", "All of it.")
        written = write_recap(
            model, [FIRST, SECOND], lambda: model.complete.call_count >= 1
        )
        self.assertEqual(written, "")
        self.assertEqual(model.complete.call_count, 1)

    def test_a_job_cancelled_once_the_book_is_read_never_writes_the_recap(self) -> None:
        # The last turn is the longest of them, and an author who stopped the job
        # while the book was being read did not ask for two more minutes of it.
        model = build_model("After one.", "After two.", "All of it.")
        written = write_recap(
            model, [FIRST], lambda: model.complete.call_count >= 2
        )
        self.assertEqual(written, "")
        self.assertEqual(model.complete.call_count, 2)

    def test_a_cancelled_job_stops_counting_where_it_stopped_reading(self) -> None:
        model = build_model("After one.", "After two.", "After three.", "All of it.")
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
