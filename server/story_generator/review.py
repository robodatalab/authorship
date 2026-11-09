"""The author's review of what the stages' steps produce, at the editor: the story
as a step would leave it is shown to the author, with the part it changed brought
into view, by chance, the less often the more the author trusts the stage; the
author answers from the editor's main menu with a pass, a fail that says how to do
it again, or a stop. The author is also asked to work on the story themselves, with
the part of authorship to do it in brought into view, and answers once done."""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol

from authordoc.storydoc import Document

# How far every result the author approves moves the confidence in the stage
# towards certainty.
RISE = 0.2

# The most confidence there can be in a stage: at least one result in ten is
# still reviewed, so that a drift in the results is caught.
CAP = 0.9


class Verdict(Enum):
    ACCEPT = "accept"
    REVISE = "revise"
    STOP = "stop"


@dataclass(frozen=True)
class ReviewResult:
    """The author's answer to a result; when it is to be done again, the comment
    says how."""

    verdict: Verdict
    comment: str = ""

    @classmethod
    def success(cls) -> ReviewResult:
        return cls(Verdict.ACCEPT, "")

    @classmethod
    def failed(cls, reviewer_instruction: str = "") -> ReviewResult:
        return cls(Verdict.REVISE, reviewer_instruction)

    @classmethod
    def abort(cls) -> ReviewResult:
        return cls(Verdict.STOP, "")

    def is_passed(self) -> bool:
        return self.verdict == Verdict.ACCEPT

    def is_failed(self) -> bool:
        return self.verdict == Verdict.REVISE

    def is_aborted(self) -> bool:
        return self.verdict == Verdict.STOP


class Shown(Protocol):
    """The part of authorship brought into view for the author."""

    def written(self) -> dict[str, Any]:
        """As the editor reads it."""


@dataclass(frozen=True)
class AnnotationShown:
    """A salient concept or a plot, selected in its sidebar tab, and, when there is
    one, a passage of it: a plot's event, a concept's reference."""

    cell_kind: str
    annotation_cell_id: str
    passage_id: str | None

    def written(self) -> dict[str, Any]:
        return {
            "kind": "annotation",
            "cellKind": self.cell_kind,
            "annotationCellId": self.annotation_cell_id,
            "passageId": self.passage_id,
        }


@dataclass(frozen=True)
class CellShown:
    """A cell of the story, brought into view in the editor."""

    cell_id: str

    def written(self) -> dict[str, Any]:
        return {"kind": "cell", "cellId": self.cell_id}


@dataclass(frozen=True)
class CommandShown:
    """The sidebar tab of a kind of cell, with the button of one of its commands
    highlighted: what the author is to do there."""

    cell_kind: str
    command_name: str

    def written(self) -> dict[str, Any]:
        return {"kind": "command", "cellKind": self.cell_kind, "commandName": self.command_name}


@dataclass(frozen=True)
class Answer:
    """The author's answer, and the story as the editor had it when they gave it."""

    review_result: ReviewResult
    story: str


STOPPED = Answer(ReviewResult.abort(), "")


@dataclass(frozen=True)
class Asked:
    """What the author is asked, numbered, so that the editor acts on every question
    once: to review `story`, the story as a step would leave it, or, with no story,
    to work on the story as it is; either way, with a part of authorship shown."""

    number: int
    story: str | None
    shown: Shown

    def written(self) -> dict[str, Any]:
        return {"number": self.number, "story": self.story, "shown": self.shown.written()}


class Author:
    """The author at the editor, whom the generation asks, and waits for: what they
    are asked is in `asked` until they answer. The answer comes from the server's
    own threads, so it is handed over to the generation's loop. Once stopped, the
    author answers every question with a stop, at once."""

    def __init__(self) -> None:
        self.asked: Asked | None = None
        self._times_asked = 0
        self._stopped = False
        self._answer: asyncio.Future[Answer] | None = None

    async def review(self, story: Document, shown: Shown) -> Answer:
        """The author's answer to the story, as a step would leave it."""
        answer = await self._asked(story.text, shown)
        return answer

    async def work(self, shown: Shown) -> Answer:
        """The author's answer once they have worked on the story: they leave it in
        the answer."""
        answer = await self._asked(None, shown)
        return answer

    def answer(self, answer: Answer) -> None:
        """The author answers what they are asked; with nothing asked, the answer is
        left unread."""
        awaited = self._answer
        if awaited is None:
            return
        loop = awaited.get_loop()
        loop.call_soon_threadsafe(_settle, awaited, answer)

    def stop(self) -> None:
        self._stopped = True
        self.answer(STOPPED)

    async def _asked(self, story: str | None, shown: Shown) -> Answer:
        if self._stopped:
            return STOPPED
        self._times_asked += 1
        loop = asyncio.get_running_loop()
        self._answer = loop.create_future()
        self.asked = Asked(self._times_asked, story, shown)
        answer = await self._answer
        self.asked = None
        self._answer = None
        return answer


def _settle(awaited: asyncio.Future[Answer], answer: Answer) -> None:
    """The first answer to a question is the author's; one given twice is left unread."""
    if not awaited.done():
        awaited.set_result(answer)


class Review:
    """The review of one stage's results by the author, and the author's confidence
    in the stage: rising a fifth of the way towards certainty with every result the
    author approves, and halving with every result the author has done again;
    never above `CAP`."""

    def __init__(self, initial_confidence: float, chance: random.Random, author: Author) -> None:
        self.confidence = initial_confidence
        self._chance = chance
        self._author = author

    async def __call__(self, story: Document, shown: Shown) -> ReviewResult:
        """Whether the story, as a step would leave it, passes. It is shown to the
        author by chance, the more likely the less the confidence, and passes
        unseen, and logged, otherwise."""
        logger = logging.getLogger(__name__)
        drawn = self._chance.random()
        if drawn >= 1 - self.confidence:
            logger.info("passed unreviewed, at confidence %.2f", self.confidence)
            unreviewed = ReviewResult.success()
            return unreviewed
        answer = await self._author.review(story, shown)
        review_result = answer.review_result
        if review_result.is_failed():
            self.confidence = self.confidence / 2
            logger.info("confidence: %.2f", self.confidence)
        elif review_result.is_passed():
            risen = self.confidence + (1 - self.confidence) * RISE
            self.confidence = min(risen, CAP)
            logger.info("confidence: %.2f", self.confidence)
        return review_result

    async def ask(self, shown: Shown) -> Answer:
        """The author's answer once they have worked on the story, with the part of
        authorship to do it in shown. Always asked, however confident the author is
        in the stage."""
        answer = await self._author.work(shown)
        return answer
