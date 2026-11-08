"""The workflow of writing a story with its author.

The stages run one after another, each on what the ones before it wrote:

    concepts → plot ends → mesh → scenes → choices → validity

The story is built from its concepts: every concept gets a plot, begun as its
start and its goal; the mesh fills every plot in between, so that the plots meet; every
scene is built from versions dedicated to the concepts of its events' plots,
merged between the concepts' markers; and the choices that end the scenes come
after them. Last, the story is played as the benchmark plays it, to check that
it does what the benchmark needs of it.

A stage only plans its work as steps. Everything else happens here: the steps
run one after another, each done again with the author's instruction until its
result passes its review; after every step, the story is saved, with the
checkpoint of where the generation stands; and the stage's progress is shown.
Stopped in a stage, or killed in it, the workflow resumes at that stage, from its
first step, as confident in the stage as it was.

While a stage runs, whatever is logged under this package goes to the
workflow's handler as that stage's; the workflow logs when the stage starts, and
when it finishes or the author stops in it."""

from __future__ import annotations

import logging
import random
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from tqdm import tqdm

from cortexgrid_infer import CompletingModel
from server.story_generator.generated_doc import GeneratedDocument
from server.story_generator.review import ReviewResult, TerminalReview
from server.story_generator.stage import Stage
from server.story_generator.stages.choices import Choices
from server.story_generator.stages.concepts import Concepts
from server.story_generator.stages.mesh import Mesh
from server.story_generator.stages.plots import Plots
from server.story_generator.stages.scenes import Scenes
from server.story_generator.stages.validity import Validity


class Workflow:
    def __init__(
        self,
        path: Path,
        model: CompletingModel,
        handler: logging.Handler,
        chance: random.Random | None = None,
    ) -> None:
        self._handler = handler
        # What draws the results the author reviews.
        self._chance = chance if chance is not None else random.Random()
        self.stages: dict[str, Stage] = {
            "concepts": Concepts(model),
            "plots": Plots(model),
            "mesh": Mesh(model),
            "scenes": Scenes(model),
            "choices": Choices(model),
            "validity": Validity(),
        }

        self._document = GeneratedDocument(path, list(self.stages))


    async def run(self) -> None:
        """Runs every stage not finished yet, in order, until the last is finished
        or the author stops in one."""
        logger = logging.getLogger(__name__)

        self._document.load()
        
        stage_name = self._document.next_stage()
        stage_aborted = False
        while stage_name and not stage_aborted:
            stage = self.stages[stage_name]
            initial_confidence = self._document.confidence.get(stage_name, 0.0)
            reviews = TerminalReview(initial_confidence, self._chance)

            with _logged_as(stage_name, self._handler):
                logger.info("started")
                steps = stage.run(self._document.document)

                for step in tqdm(steps, desc=stage_name):
                    review_result = ReviewResult.failed()
                    document = self._document.document
                    while review_result.is_failed():
                        review_result, document = await step(self._document.document, reviews, review_result.comment)

                    if review_result.is_passed():
                        self._document.document = document
                        self._document.confidence[stage_name] = reviews.confidence
                        self._document.save()
                    else:
                        stage_aborted = True
                        break

                logger.info("finished")

            if not stage_aborted:
                self._document.mark_stage_done(stage_name)
                self._document.save()
                stage_name =  self._document.next_stage()


@contextmanager
def _logged_as(stage: str, handler: logging.Handler) -> Generator[None]:
    """While inside, whatever is logged under this package goes to the handler,
    every record stamped with the stage's name as `record.stage`."""

    def stamped(record: logging.LogRecord) -> bool:
        record.stage = stage
        return True

    package_logger = logging.getLogger(__package__)
    package_logger.setLevel(logging.INFO)
    handler.addFilter(stamped)
    package_logger.addHandler(handler)
    try:
        yield
    finally:
        package_logger.removeHandler(handler)
        handler.removeFilter(stamped)
