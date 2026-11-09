import random
import unittest
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, Mock, call

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT, SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import STOPPED, AnnotationShown, Answer, CommandShown, Review, ReviewResult
from server.story_generator.stages.concepts import DESCRIPTION_INSTRUCTIONS, AskForConceptsStep, DescribeConceptsStep


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class AskForConceptsStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_the_concepts_the_author_adds_come_first_in_the_story(self) -> None:
        document = Document.from_cells([MarkdownCell("Prologue.", False, None, "m1")])
        # The author adds two concepts in the Salient Concepts tab, after the prologue.
        added = Document.from_cells(
            [
                MarkdownCell("Prologue.", False, None, "m1"),
                SalientConceptCell("Motherhood", [], "", False, None, "k1"),
                SalientConceptCell("War", [], "", False, None, "k2"),
            ]
        )
        author = Mock()
        author.work = AsyncMock(return_value=Answer(ReviewResult.success(), added.text))
        reviews = Review(0.0, random.Random(0), author)

        result, changed = await AskForConceptsStep()(document, reviews, "")

        author.work.assert_awaited_once_with(CommandShown(SALIENT_CONCEPT, "addStoryAnnotation"))
        self.assertEqual(result, ReviewResult.success())
        motherhood, war, prologue = changed.cells
        self.assertEqual(motherhood.unique_id, "k1")
        self.assertEqual(war.unique_id, "k2")
        self.assertEqual(prologue.unique_id, "m1")

    async def test_stopped_leaves_the_story_as_it_was(self) -> None:
        document = Document.from_cells([MarkdownCell("Prologue.", False, None, "m1")])
        author = Mock()
        author.work = AsyncMock(return_value=STOPPED)
        reviews = Review(0.0, random.Random(0), author)

        result, unchanged = await AskForConceptsStep()(document, reviews, "")

        self.assertEqual(result, ReviewResult.abort())
        self.assertIs(unchanged, document)


class DescribeConceptsStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_describes_only_the_authors_concepts_again_with_the_authors_feedback_until_accepted(self) -> None:
        document = Document.from_cells([SalientConceptCell("Motherhood", [], "", False, None, "k1")])
        # The author has the description done again, then accepts the second.
        author = Mock()
        author.review = AsyncMock(
            side_effect=[
                Answer(ReviewResult.failed("say what it costs her"), ""),
                Answer(ReviewResult.success(), ""),
            ]
        )
        reviews = Review(0.0, random.Random(0), author)
        model = Mock()
        model.complete.side_effect = [
            streamed("### Motherhood\nA mother's care."),
            streamed("### Motherhood\nA mother's care, at what it costs her.\n\n### Brutal father\nA father who rules by fear."),
        ]
        describe = DescribeConceptsStep(model)

        first_result, first_document = await describe(document, reviews, "")
        _, second_document = await describe(first_document, reviews, first_result.comment)

        self.assertEqual(first_result, ReviewResult.failed("Motherhood: say what it costs her"))
        self.assertEqual(
            model.complete.call_args_list,
            [
                call(
                    [
                        {"role": "system", "content": DESCRIPTION_INSTRUCTIONS},
                        {"role": "user", "content": "The author's concepts:\n### Motherhood\n"},
                    ],
                    max_new_tokens=1500,
                ),
                call(
                    [
                        {"role": "system", "content": DESCRIPTION_INSTRUCTIONS},
                        {
                            "role": "user",
                            "content": "The author's concepts:\n### Motherhood\n\n\nThe author asks you to do it again: Motherhood: say what it costs her",
                        },
                    ],
                    max_new_tokens=1500,
                ),
            ],
        )
        written = InteractiveAuthorStory(second_document).written_concepts()
        self.assertEqual(written, "### Motherhood\nA mother's care, at what it costs her.")

    async def test_shows_the_author_every_description_in_turn(self) -> None:
        document = Document.from_cells(
            [
                SalientConceptCell("Motherhood", [], "", False, None, "k1"),
                SalientConceptCell("War", [], "", False, None, "k2"),
            ]
        )
        author = Mock()
        author.review = AsyncMock(return_value=Answer(ReviewResult.success(), ""))
        reviews = Review(0.0, random.Random(0), author)
        model = Mock()
        model.complete.side_effect = [streamed("### Motherhood\nA mother's care.\n\n### War\nA war.")]

        await DescribeConceptsStep(model)(document, reviews, "")

        first_review, second_review = author.review.await_args_list
        _, first_shown = first_review.args
        _, second_shown = second_review.args
        self.assertEqual(first_shown, AnnotationShown(SALIENT_CONCEPT, "k1", None))
        self.assertEqual(second_shown, AnnotationShown(SALIENT_CONCEPT, "k2", None))
