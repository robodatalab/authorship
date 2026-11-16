"""A stage of writing a story: the steps it plans for the story, each of which does
a part of the stage's work and gives the story back changed, and the part of
authorship the author reviews the stage's work in."""

from __future__ import annotations

from abc import ABC, abstractmethod

from authordoc.storydoc import Document
from server.story_generator.review import Shown


class StageStep(ABC):
    """One step of a stage's work."""

    @abstractmethod
    async def __call__(self, document: Document) -> Document:
        """Does the step's work on the story, and gives the story back changed."""


class Stage(ABC):
    """One stage of writing a story. It plans its work as steps, and does nothing
    else: the workflow runs the steps, has the author review the story they
    leave, saves it, and shows the stage's progress."""

    @abstractmethod
    def run(self, document: Document) -> list[StageStep]:
        """The steps of the stage's work on the story."""

    @abstractmethod
    def shown(self) -> Shown:
        """The part of authorship the author reviews the stage's work in."""
