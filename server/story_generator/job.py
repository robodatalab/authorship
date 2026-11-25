"""Generating a story with its author, as one of the server's jobs: a stage of the
workflow, run on the story."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from authordoc.storydoc import Document
from server.jobs import Job
from server.progress import with_progress
from server.story_generator.stage import Stage


class StoryGenerationJob(Job):
    kind = "story"

    def __init__(self, stage_name: str, stage: Stage, path: Path, story: str) -> None:
        super().__init__(str(path))
        self._stage_name = stage_name
        self._stage = stage
        self._path = path
        self._story = story
        self.story_generated: str | None = None

    async def execute(self) -> None:
        document = Document(self._story, self._path)
        steps = self._stage.run(document)
        for step in with_progress(steps, self._stage_name):
            document = await step(document)
        self.story_generated = document.text

    def snapshot(self) -> dict[str, Any]:
        progress = self.progress.reported()
        return {"progress": progress, "story": self.story_generated}
