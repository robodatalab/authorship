"""The workflow of writing a story with its author.

The stages run one after another, each on what the ones before it wrote:

    concept titles → concepts → plot ends → mesh → scenes → choices → validity

The story is built from its concepts: the author adds them; every concept gets a
plot, begun as its start and its goal; the mesh fills every plot in between, so
that the plots meet; every scene is built from versions dedicated to the
concepts of its events' plots, merged between the concepts' markers; and the
choices that end the scenes come after them. Last, the story is played as the
benchmark plays it, to check that it does what the benchmark needs of it.

A stage only plans its work as steps. Everything else happens here: the steps
run one after another, with the stage's progress reported, as the server's jobs
report theirs; then the author reviews the story the stage leaves, edits it as
they like, and accepts it, or stops. The story the author accepts is saved, with
the checkpoint of where the generation stands. Stopped in a stage, or killed in
it, the workflow resumes at that stage, from its first step, on the story the
stage before left.

The workflow logs when a stage starts, and when it finishes."""

from __future__ import annotations

import logging
from pathlib import Path

from authordoc.storydoc import Document
from cortexgrid_infer import CompletingModel
from server.progress import with_progress
from server.story_generator.generated_doc import GeneratedDocument
from server.story_generator.review import Asked
from server.story_generator.stage import Stage
from server.story_generator.stages.choices import Choices
from server.story_generator.stages.concepts import Concepts, ConceptTitles
from server.story_generator.stages.mesh import Mesh
from server.story_generator.stages.plots import Plots
from server.story_generator.stages.scenes import Scenes
from server.story_generator.stages.validity import Validity


class Workflow:
    def __init__(self, path: Path, model: CompletingModel) -> None:
        self.path = path
        self.stages: dict[str, Stage] = {
            "concept titles": ConceptTitles(),
            "concepts": Concepts(model),
            "plots": Plots(model),
            "mesh": Mesh(model),
            "scenes": Scenes(model),
            "choices": Choices(model),
            "validity": Validity(),
        }

        self._document = GeneratedDocument(path, list(self.stages))

    def stages_done(self) -> dict[str, bool]:
        """Every stage, in the order they run, and whether it is finished."""
        stages_done = dict(self._document.stages)
        return stages_done

    def next_stage(self) -> str | None:
        self._document.load()
        stage_name = self._document.next_stage()
        return stage_name

    async def run(self, stage_name: str) -> Asked:
        logger = logging.getLogger(__name__)
        logger.info("%s started", stage_name)

        self._document.load()
        document = self._document.document
        stage = self.stages[stage_name]
        steps = stage.run(document)
        for step in with_progress(steps, stage_name):
            document = await step(document)

        stage_names = list(self.stages)
        number = stage_names.index(stage_name) + 1
        shown = stage.shown()
        asked = Asked(number, document.text, shown)
        return asked

    def accept(self, stage_name: str, story: str) -> None:
        logger = logging.getLogger(__name__)

        self._document.load()
        self._document.document = Document(story, self.path)
        self._document.mark_stage_done(stage_name)
        self._document.save()
        logger.info("%s finished", stage_name)
