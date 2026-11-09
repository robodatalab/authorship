import random
import tempfile
import unittest
from collections.abc import AsyncIterator
from pathlib import Path
from unittest.mock import AsyncMock, Mock

from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT, SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.review import STOPPED, Answer, CommandShown, ReviewResult
from server.story_generator.workflow import Workflow


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class WorkflowRun(unittest.IsolatedAsyncioTestCase):
    async def test_asks_the_author_to_add_the_concepts_first(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            author = Mock()
            author.work = AsyncMock(return_value=STOPPED)
            workflow = Workflow(story, Mock(), author, random.Random(0))

            await workflow.run()

        author.work.assert_awaited_once_with(CommandShown(SALIENT_CONCEPT, "addStoryAnnotation"))

    async def test_saves_the_concepts_the_author_added_before_they_are_described(self) -> None:
        added = Document.from_cells([SalientConceptCell("Motherhood", [], "", False, None, "k1")])
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            author = Mock()
            author.work = AsyncMock(return_value=Answer(ReviewResult.success(), added.text))
            # The author stops at the first description.
            author.review = AsyncMock(return_value=STOPPED)
            model = Mock()
            model.complete.side_effect = [streamed("### Motherhood\nA mother's care.")]
            workflow = Workflow(story, model, author, random.Random(0))

            await workflow.run()

            saved = Document.load(story)
        (concept,) = saved.salient_concepts()
        self.assertEqual(concept.title, "Motherhood")
        self.assertEqual(concept.source, "")
