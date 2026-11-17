"""Generating a story with its author, as one of the server's jobs: a stage of the
workflow, run on the story's file."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cortexgrid
from cortexgrid_infer import CompletingModel
from server.jobs import Job
from server.story_generator.review import Asked
from server.story_generator.workflow import Workflow


class StoryGenerationJob(Job):
    """A stage of the workflow, run on the story's file; once it is done, what it
    asks the author is `asked`."""

    kind = "story"

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel], path: Path, stage_name: str) -> None:
        super().__init__(str(path))
        self.path = path
        self.stage_name = stage_name
        self._deployment = deployment
        self.asked: Asked | None = None

    async def execute(self) -> None:
        model = self._deployment.client_async()
        workflow = Workflow(self.path)
        asked = await workflow.run(self.stage_name, model)
        self.asked = None if self.cancelled else asked

    def snapshot(self) -> dict[str, Any]:
        progress = self.progress.reported()
        asked = None if self.asked is None else self.asked.written()
        return {"progress": progress, "asked": asked}
