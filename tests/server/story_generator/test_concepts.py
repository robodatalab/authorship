import random
import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock, call, patch

from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import ReviewResult, TerminalReview
from server.story_generator.stages.concepts import DESCRIPTION_INSTRUCTIONS, AskForConceptsStep, DescribeConceptsStep


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class AskForConceptsStepCall(unittest.IsolatedAsyncioTestCase):
    @patch("builtins.input", side_effect=["Motherhood", "War", ""])
    async def test_the_concepts_typed_become_the_storys_concepts(self, _) -> None:
        document = Document("")
        chance = random.Random(0)
        reviews = TerminalReview(0.0, chance)

        _, changed = await AskForConceptsStep()(document, reviews, "")

        written = InteractiveAuthorStory(changed).written_concepts()
        self.assertEqual(written, "### Motherhood\n\n\n### War\n")


class DescribeConceptsStepCall(unittest.IsolatedAsyncioTestCase):
    # The author has the descriptions done again, then accepts the second.
    @patch("builtins.input", side_effect=["r", "say what it costs her", "a"])
    async def test_describes_only_the_authors_concepts_again_with_the_authors_feedback_until_accepted(self, _) -> None:
        document = Document.from_cells([SalientConceptCell("Motherhood", [], "", False, None, "k1")])
        chance = random.Random(0)
        reviews = TerminalReview(0.0, chance)
        model = Mock()
        model.complete.side_effect = [
            streamed("### Motherhood\nA mother's care."),
            streamed("### Motherhood\nA mother's care, at what it costs her.\n\n### Brutal father\nA father who rules by fear."),
        ]
        describe = DescribeConceptsStep(model)

        first_result, first_document = await describe(document, reviews, "")
        _, second_document = await describe(first_document, reviews, first_result.comment)

        self.assertEqual(first_result, ReviewResult.failed("say what it costs her"))
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
                            "content": "The author's concepts:\n### Motherhood\n\n\nThe author asks you to do it again: say what it costs her",
                        },
                    ],
                    max_new_tokens=1500,
                ),
            ],
        )
        written = InteractiveAuthorStory(second_document).written_concepts()
        self.assertEqual(written, "### Motherhood\nA mother's care, at what it costs her.")
