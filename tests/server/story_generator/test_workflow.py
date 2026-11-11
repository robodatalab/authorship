import tempfile
import unittest
from collections.abc import AsyncIterator
from pathlib import Path
from unittest.mock import AsyncMock, Mock

from authordoc.cells.plot_cell import PLOT
from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT, SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from parameterized import parameterized
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import STOPPED, Answer, CommandShown, EditorShown, Shown, TabShown, Verdict
from server.story_generator.stage import Stage
from server.story_generator.stages.choices import Choices
from server.story_generator.stages.concepts import Concepts, ConceptTitles
from server.story_generator.stages.mesh import Mesh
from server.story_generator.stages.plots import Plots
from server.story_generator.stages.scenes import Scenes
from server.story_generator.stages.validity import Validity
from server.story_generator.workflow import Workflow


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class WorkflowRun(unittest.IsolatedAsyncioTestCase):
    async def test_asks_the_author_to_add_the_concepts_first(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            author = Mock()
            author.review = AsyncMock(return_value=STOPPED)
            workflow = Workflow(story, Mock(), author)

            await workflow.run()

        _, shown = author.review.await_args.args
        self.assertEqual(shown, CommandShown(SALIENT_CONCEPT, "addStoryAnnotation"))

    async def test_has_the_author_review_the_concepts_once_every_one_is_described(self) -> None:
        added = Document.from_cells([SalientConceptCell("Motherhood", [], "", False, None, "k1")])
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            author = Mock()
            author.review = AsyncMock(side_effect=[Answer(Verdict.ACCEPT, added.text), STOPPED])
            model = Mock()
            model.complete.side_effect = [streamed("### Motherhood\nA mother's care.")]
            workflow = Workflow(story, model, author)

            await workflow.run()

        _, second_review = author.review.await_args_list
        reviewed, shown = second_review.args
        written = InteractiveAuthorStory(reviewed).written_concepts()
        self.assertEqual(written, "### Motherhood\nA mother's care.")
        self.assertEqual(shown, TabShown(SALIENT_CONCEPT))

    async def test_saves_the_story_the_author_accepts_and_not_the_one_they_stop_at(self) -> None:
        added = Document.from_cells([SalientConceptCell("Motherhood", [], "", False, None, "k1")])
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            author = Mock()
            # The author adds a concept, then stops at its description.
            author.review = AsyncMock(side_effect=[Answer(Verdict.ACCEPT, added.text), STOPPED])
            model = Mock()
            model.complete.side_effect = [streamed("### Motherhood\nA mother's care.")]
            workflow = Workflow(story, model, author)

            await workflow.run()

            saved = Document.load(story)
        (concept,) = saved.salient_concepts()
        self.assertEqual(concept.title, "Motherhood")
        self.assertEqual(concept.source, "")


class WorkflowStagesDone(unittest.IsolatedAsyncioTestCase):
    async def test_the_stages_the_author_accepted_are_finished(self) -> None:
        added = Document.from_cells([SalientConceptCell("Motherhood", [], "", False, None, "k1")])
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            author = Mock()
            # The author adds a concept, then stops at its description.
            author.review = AsyncMock(side_effect=[Answer(Verdict.ACCEPT, added.text), STOPPED])
            model = Mock()
            model.complete.side_effect = [streamed("### Motherhood\nA mother's care.")]
            workflow = Workflow(story, model, author)
            await workflow.run()

            stages_done = workflow.stages_done()

        self.assertEqual(
            stages_done,
            {
                "concept titles": True,
                "concepts": False,
                "plots": False,
                "mesh": False,
                "scenes": False,
                "choices": False,
                "validity": False,
            },
        )


class StageShown(unittest.TestCase):
    @parameterized.expand(
        [
            ("concept_titles", ConceptTitles(), CommandShown(SALIENT_CONCEPT, "addStoryAnnotation")),
            ("concepts", Concepts(Mock()), TabShown(SALIENT_CONCEPT)),
            ("plots", Plots(Mock()), TabShown(PLOT)),
            ("mesh", Mesh(Mock()), TabShown(PLOT)),
            ("scenes", Scenes(Mock()), EditorShown()),
            ("choices", Choices(Mock()), EditorShown()),
            ("validity", Validity(), EditorShown()),
        ]
    )
    def test_every_stage_is_reviewed_where_its_work_shows(self, _, stage: Stage, expected: Shown) -> None:
        self.assertEqual(stage.shown(), expected)
