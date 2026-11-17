import tempfile
import unittest
from collections.abc import AsyncIterator
from pathlib import Path
from unittest.mock import Mock

from authordoc.cells.plot_cell import PLOT
from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT
from cortexgrid_infer import CompletionChunk
from parameterized import parameterized
from server.story_generator.review import Asked, CommandShown, EditorShown, Shown, TabShown
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


class WorkflowNextStage(unittest.TestCase):
    @parameterized.expand(
        [
            ("never_generated", "", "concept titles"),
            (
                "left_off_at_the_concepts",
                '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
                "stage: concept titles: True\n"
                "stage: concepts: False\n",
                "concepts",
            ),
            (
                "generated_to_the_end",
                '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
                "stage: concept titles: True\n"
                "stage: concepts: True\n"
                "stage: plots: True\n"
                "stage: mesh: True\n"
                "stage: scenes: True\n"
                "stage: choices: True\n"
                "stage: validity: True\n",
                None,
            ),
        ]
    )
    def test_is_the_first_stage_not_finished(self, _, written: str, expected: str | None) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text(written, encoding="utf-8")
            workflow = Workflow(story, Mock())

            stage_name = workflow.next_stage()

        self.assertEqual(stage_name, expected)


class WorkflowRun(unittest.IsolatedAsyncioTestCase):
    async def test_asks_the_author_to_add_the_concepts_first(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            workflow = Workflow(story, Mock())

            asked = await workflow.run("concept titles")

        self.assertEqual(asked, Asked(1, "", CommandShown(SALIENT_CONCEPT, "addStoryAnnotation")))

    async def test_asks_the_author_to_review_the_concepts_once_every_one_is_described(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text(
                '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\n'
                '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
                "stage: concept titles: True\n"
                "stage: concepts: False\n",
                encoding="utf-8",
            )
            model = Mock()
            model.complete.side_effect = [streamed("### Motherhood\nA mother's care.")]
            workflow = Workflow(story, model)

            asked = await workflow.run("concepts")

        self.assertEqual(
            asked,
            Asked(
                2,
                '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\n'
                "A mother's care.\n\n"
                '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
                "stage: concept titles: True\n"
                "stage: concepts: False\n",
                TabShown(SALIENT_CONCEPT),
            ),
        )

    async def test_leaves_the_story_it_asks_about_unsaved(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text(
                '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\n'
                '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
                "stage: concept titles: True\n"
                "stage: concepts: False\n",
                encoding="utf-8",
            )
            model = Mock()
            model.complete.side_effect = [streamed("### Motherhood\nA mother's care.")]
            workflow = Workflow(story, model)

            await workflow.run("concepts")

            saved = story.read_text(encoding="utf-8")
        self.assertEqual(
            saved,
            '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\n'
            '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
            "stage: concept titles: True\n"
            "stage: concepts: False\n",
        )


class WorkflowAccept(unittest.TestCase):
    def test_saves_the_story_the_author_accepts_with_the_stage_finished(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            workflow = Workflow(story, Mock())

            workflow.accept(
                "concept titles",
                '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\n'
                '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
                "stage: concept titles: False\n",
            )

            saved = story.read_text(encoding="utf-8")
        self.assertEqual(
            saved,
            '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\n'
            '<!-- cell: GeneratedDocumentCheckpoint id="g1" -->\n\n'
            "stage: concept titles: True\n"
            "stage: concepts: False\n"
            "stage: plots: False\n"
            "stage: mesh: False\n"
            "stage: scenes: False\n"
            "stage: choices: False\n"
            "stage: validity: False\n",
        )


class WorkflowStagesDone(unittest.TestCase):
    def test_the_stages_the_author_accepted_are_finished(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            story = Path(folder) / "story.author"
            story.write_text("", encoding="utf-8")
            workflow = Workflow(story, Mock())
            workflow.accept("concept titles", '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n')

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
