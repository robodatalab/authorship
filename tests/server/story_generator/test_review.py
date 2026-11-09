import asyncio
import random
import unittest
from unittest.mock import AsyncMock, Mock

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT
from authordoc.storydoc import Document
from parameterized import parameterized
from server.story_generator.review import STOPPED, Answer, Author, CellShown, CommandShown, Review, ReviewResult


class ReviewCall(unittest.IsolatedAsyncioTestCase):
    @parameterized.expand(
        [
            ("accepted", Answer(ReviewResult.success(), ""), 0.6),
            ("revised", Answer(ReviewResult.failed("make it shorter"), ""), 0.25),
            ("stopped", STOPPED, 0.5),
        ]
    )
    async def test_the_confidence_moves_with_the_authors_answer(self, _, answer: Answer, expected_confidence: float) -> None:
        # The first draw, 0.134, is below one less the confidence: the author is
        # shown the story.
        author = Mock()
        author.review = AsyncMock(return_value=answer)
        reviews = Review(0.5, random.Random(1), author)
        story = Document.from_cells([MarkdownCell("Varn waited.", False, None, "s1")])

        review_result = await reviews(story, CellShown("s1"))

        self.assertEqual(review_result, answer.review_result)
        self.assertAlmostEqual(reviews.confidence, expected_confidence)

    async def test_passes_unseen_at_full_confidence(self) -> None:
        author = Mock()
        author.review = AsyncMock()
        reviews = Review(1.0, random.Random(0), author)
        story = Document.from_cells([MarkdownCell("Varn waited.", False, None, "s1")])

        review_result = await reviews(story, CellShown("s1"))

        self.assertEqual(review_result, ReviewResult.success())
        author.review.assert_not_awaited()


class AuthorReview(unittest.IsolatedAsyncioTestCase):
    async def test_the_author_is_asked_until_they_answer(self) -> None:
        author = Author()
        story = Document.from_cells([MarkdownCell("Varn waited.", False, None, "s1")])

        asking = asyncio.create_task(author.review(story, CellShown("s1")))
        await asyncio.sleep(0)
        asked = author.asked.written()
        author.answer(Answer(ReviewResult.failed("make it shorter"), ""))
        answer = await asking

        self.assertEqual(asked, {"number": 1, "story": story.text, "shown": {"kind": "cell", "cellId": "s1"}})
        self.assertEqual(answer, Answer(ReviewResult.failed("make it shorter"), ""))
        self.assertIsNone(author.asked)


class AuthorWork(unittest.IsolatedAsyncioTestCase):
    async def test_the_author_is_asked_with_no_story_to_review_and_answers_with_theirs(self) -> None:
        author = Author()

        asking = asyncio.create_task(author.work(CommandShown(SALIENT_CONCEPT, "addStoryAnnotation")))
        await asyncio.sleep(0)
        asked = author.asked.written()
        author.answer(Answer(ReviewResult.success(), "The story as the author left it."))
        answer = await asking

        self.assertEqual(
            asked,
            {
                "number": 1,
                "story": None,
                "shown": {"kind": "command", "cellKind": "salient-concept", "commandName": "addStoryAnnotation"},
            },
        )
        self.assertEqual(answer, Answer(ReviewResult.success(), "The story as the author left it."))


class AuthorStop(unittest.IsolatedAsyncioTestCase):
    async def test_the_question_asked_is_answered_with_a_stop(self) -> None:
        author = Author()

        asking = asyncio.create_task(author.work(CommandShown(SALIENT_CONCEPT, "addStoryAnnotation")))
        await asyncio.sleep(0)
        author.stop()
        answer = await asking

        self.assertEqual(answer, STOPPED)

    async def test_every_later_question_is_answered_with_a_stop_at_once(self) -> None:
        author = Author()
        story = Document.from_cells([MarkdownCell("Varn waited.", False, None, "s1")])

        author.stop()
        answer = await author.review(story, CellShown("s1"))

        self.assertEqual(answer, STOPPED)
        self.assertIsNone(author.asked)
