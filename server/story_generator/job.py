"""Generating a story with its author, as one of the server's jobs: the workflow,
run on the story's file, for as long as the author works on it."""

from __future__ import annotations

from pathlib import Path

from cortexgrid_infer import CompletingModel
from server.jobs import Job
from server.story_generator.review import Author
from server.story_generator.workflow import Workflow


class StoryGenerationJob(Job):
    """The workflow, run on the story's file; what it asks the author is
    `author.asked`, and the author answers through `author`."""

    kind = "story"

    def __init__(self, model: CompletingModel, path: Path) -> None:
        super().__init__(str(path))
        self.author = Author()
        self._workflow = Workflow(path, model, self.author)

    def cancel(self) -> None:
        """A cancelled generation stops as the author stops it."""
        super().cancel()
        self.author.stop()

    async def execute(self) -> None:
        await self._workflow.run()
