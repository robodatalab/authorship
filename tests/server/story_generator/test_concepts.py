import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.stages.concepts import DESCRIPTION_INSTRUCTIONS, DescribeConceptsStep


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class DescribeConceptsStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_describes_only_the_authors_concepts(self) -> None:
        document = Document.from_cells([SalientConceptCell("Motherhood", [], "", False, None, "k1")])
        model = Mock()
        model.complete.side_effect = [
            streamed("### Motherhood\nA mother's care.\n\n### Brutal father\nA father who rules by fear."),
        ]

        described = await DescribeConceptsStep(model)(document)

        model.complete.assert_called_once_with(
            [
                {"role": "system", "content": DESCRIPTION_INSTRUCTIONS},
                {"role": "user", "content": "The author's concepts:\n### Motherhood\n"},
            ],
            max_new_tokens=1500,
        )
        written = InteractiveAuthorStory(described).written_concepts()
        self.assertEqual(written, "### Motherhood\nA mother's care.")

    async def test_the_concepts_come_first_in_the_story(self) -> None:
        # The author added two concepts in the Salient Concepts tab, after the prologue.
        document = Document.from_cells(
            [
                MarkdownCell("Prologue.", False, None, "m1"),
                SalientConceptCell("Motherhood", [], "", False, None, "k1"),
                SalientConceptCell("War", [], "", False, None, "k2"),
            ]
        )
        model = Mock()
        model.complete.side_effect = [streamed("### Motherhood\nA mother's care.\n\n### War\nA war.")]

        described = await DescribeConceptsStep(model)(document)

        motherhood, war, prologue = described.cells
        self.assertEqual(motherhood.unique_id, "k1")
        self.assertEqual(war.unique_id, "k2")
        self.assertEqual(prologue.unique_id, "m1")
