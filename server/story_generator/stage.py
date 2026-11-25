from __future__ import annotations

import abc

from authordoc.storydoc import Document
from server.story_generator.review import Shown


class StageStep(abc.ABC):
    """One step of a stage's work."""

    @abc.abstractmethod
    async def __call__(self, document: Document) -> Document:
        """Does the step's work on the story, and gives the story back changed."""


class Stage(abc.ABC):
    """One stage of writing a story."""

    @abc.abstractmethod
    def run(self, document: Document) -> list[StageStep]:
        pass

    @abc.abstractmethod
    def shown(self) -> Shown:
        """The part of authorship the author reviews the stage's work in."""
