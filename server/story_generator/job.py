"""Generating a story with its author, as one of the server's jobs: a stage of the
workflow, run on the story's file."""

from __future__ import annotations

from typing import Any

from server.jobs import Job
from server.story_generator.review import Asked
from server.story_generator.workflow import Workflow


class StoryGenerationJob(Job):
    """A stage of the workflow, run on the story's file; once it is done, what it
    asks the author is `asked`; how far along the generation is is
    `workflow.stages_done()`."""

    kind = "story"

    def __init__(self, workflow: Workflow, stage_name: str) -> None:
        super().__init__(str(workflow.path))
        self.workflow = workflow
        self.stage_name = stage_name
        self.asked: Asked | None = None

    async def execute(self) -> None:
        asked = await self.workflow.run(self.stage_name)
        self.asked = None if self.cancelled else asked

    def snapshot(self) -> dict[str, Any]:
        progress = self.progress.reported()
        stages_done = self.workflow.stages_done()
        stages = [{"name": name, "done": done} for name, done in stages_done.items()]
        asked = None if self.asked is None else self.asked.written()
        return {"progress": progress, "stages": stages, "asked": asked}
