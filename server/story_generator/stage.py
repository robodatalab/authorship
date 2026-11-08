"""A stage of writing a story: the steps it plans for the story, each of which does
a part of the stage's work, has its result reviewed, and gives the story back
changed."""

from __future__ import annotations

from abc import ABC, abstractmethod

from authordoc.storydoc import Document
from server.story_generator.review import ReviewResult, TerminalReview


class StageStep(ABC):
    """One step of a stage's work."""

    @abstractmethod
    async def __call__(self, document: Document, reviews: TerminalReview, reviewer_instruction: str) -> tuple[ReviewResult, Document]:
        """Does the step's work on the story, following the reviewer's instruction
        when there is one, and has its result reviewed. Returns the review's result
        and the story: changed when the result passed, as it was otherwise."""


class Stage(ABC):
    """One stage of writing a story. It plans its work as steps, and does nothing
    else: the workflow runs the steps, saves the story after every one,
    checkpoints the stage's progress, and shows it."""

    @abstractmethod
    def run(self, document: Document) -> list[StageStep]:
        """The steps of the stage's work on the story. Asked again, for the story
        some of them have already changed, it gives the same steps, so that the
        workflow can skip the ones done."""
