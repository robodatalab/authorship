from __future__ import annotations

from authordoc.cells.character_cell import CHARACTER
from authordoc.storydoc import Document
from server.story_generator.review import CommandShown, Shown
from server.story_generator.stage import Stage, StageStep

ADD_THE_CHARACTERS = CommandShown(CHARACTER, "insertCell")


class Cast(Stage):

    def run(self, document: Document) -> list[StageStep]:
        return []

    def shown(self) -> Shown:
        return ADD_THE_CHARACTERS
