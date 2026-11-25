from __future__ import annotations

from authordoc.storydoc import Document
from server.story_generator.stage import Stage, StageStep


class Cast(Stage):

    def run(self, document: Document) -> list[StageStep]:
        return []

