import asyncio
import unittest
from typing import Any

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.plot_cell import PLOT
from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT
from authordoc.storydoc import Document
from parameterized import parameterized
from server.story_generator.review import STOPPED, Answer, Author, CommandShown, EditorShown, Shown, TabShown, Verdict


class ShownWritten(unittest.TestCase):
    @parameterized.expand(
        [
            ("tab", TabShown(PLOT), {"kind": "tab", "cellKind": "plot"}),
            (
                "command",
                CommandShown(SALIENT_CONCEPT, "addStoryAnnotation"),
                {"kind": "command", "cellKind": "salient-concept", "commandName": "addStoryAnnotation"},
            ),
            ("editor", EditorShown(), {"kind": "editor"}),
        ]
    )
    def test_as_the_editor_reads_it(self, _, shown: Shown, expected: dict[str, Any]) -> None:
        self.assertEqual(shown.written(), expected)


class AuthorReview(unittest.IsolatedAsyncioTestCase):
    async def test_the_author_is_asked_until_they_answer_with_the_story_as_they_leave_it(self) -> None:
        author = Author()
        story = Document.from_cells([MarkdownCell("Varn waited.", False, None, "s1")])

        asking = asyncio.create_task(author.review(story, EditorShown()))
        await asyncio.sleep(0)
        asked = author.asked.written()
        author.answer(Answer(Verdict.ACCEPT, '<!-- cell: markdown id="s1" -->\n\nVarn waited at the door.\n'))
        answer = await asking

        self.assertEqual(
            asked,
            {"number": 1, "story": '<!-- cell: markdown id="s1" -->\n\nVarn waited.\n', "shown": {"kind": "editor"}},
        )
        self.assertEqual(answer, Answer(Verdict.ACCEPT, '<!-- cell: markdown id="s1" -->\n\nVarn waited at the door.\n'))
        self.assertIsNone(author.asked)


class AuthorStop(unittest.IsolatedAsyncioTestCase):
    async def test_the_question_asked_is_answered_with_a_stop(self) -> None:
        author = Author()
        story = Document.from_cells([MarkdownCell("Varn waited.", False, None, "s1")])

        asking = asyncio.create_task(author.review(story, CommandShown(SALIENT_CONCEPT, "addStoryAnnotation")))
        await asyncio.sleep(0)
        author.stop()
        answer = await asking

        self.assertEqual(answer, STOPPED)

    async def test_every_later_question_is_answered_with_a_stop_at_once(self) -> None:
        author = Author()
        story = Document.from_cells([MarkdownCell("Varn waited.", False, None, "s1")])

        author.stop()
        answer = await author.review(story, EditorShown())

        self.assertEqual(answer, STOPPED)
        self.assertIsNone(author.asked)
