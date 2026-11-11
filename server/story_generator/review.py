"""The author's review of every stage, at the editor: once a stage has done its
work, the story as it leaves it is shown to the author, with the part of
authorship the stage worked in brought into view. The author looks round it,
edits what they like, and answers from the editor's main menu: they accept the
story as they leave it, or stop."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol

from authordoc.storydoc import Document


class Verdict(Enum):
    ACCEPT = "accept"
    STOP = "stop"


class Shown(Protocol):
    """The part of authorship brought into view for the author."""

    def written(self) -> dict[str, Any]:
        """As the editor reads it."""


@dataclass(frozen=True)
class TabShown:
    """The sidebar tab of a kind of cell."""

    cell_kind: str

    def written(self) -> dict[str, Any]:
        return {"kind": "tab", "cellKind": self.cell_kind}


@dataclass(frozen=True)
class CommandShown:
    """The sidebar tab of a kind of cell, with the button of one of its commands
    highlighted: what the author is to do there."""

    cell_kind: str
    command_name: str

    def written(self) -> dict[str, Any]:
        return {"kind": "command", "cellKind": self.cell_kind, "commandName": self.command_name}


@dataclass(frozen=True)
class EditorShown:
    """The story, in the editor."""

    def written(self) -> dict[str, Any]:
        return {"kind": "editor"}


@dataclass(frozen=True)
class Answer:
    """The author's verdict, and the story as the editor had it when they gave it,
    with the author's own edits."""

    verdict: Verdict
    story: str


STOPPED = Answer(Verdict.STOP, "")


@dataclass(frozen=True)
class Asked:
    """What the author is asked, numbered, so that the editor acts on every question
    once: to review `story`, the story as a stage leaves it, with a part of
    authorship shown."""

    number: int
    story: str
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
        """The author's answer to the story, as a stage leaves it."""
        if self._stopped:
            return STOPPED
        self._times_asked += 1
        loop = asyncio.get_running_loop()
        self._answer = loop.create_future()
        self.asked = Asked(self._times_asked, story.text, shown)
        answer = await self._answer
        self.asked = None
        self._answer = None
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


def _settle(awaited: asyncio.Future[Answer], answer: Answer) -> None:
    """The first answer to a question is the author's; one given twice is left unread."""
    if not awaited.done():
        awaited.set_result(answer)
