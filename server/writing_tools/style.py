"""Upgrade the style of the document."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from cortexgrid_infer import ServedCompletingModel

from server import storydoc
from server.jobs import Job
from server.storydoc import Cell, Document

_FENCED = re.compile(r"\A\s*```[a-zA-Z]*\n(?P<body>.*)\n```\s*\Z", re.DOTALL)
THINKING_HEADROOM = 8192
SHORTEST = 0.6
LONGEST = 1.8
_FINISHED = tuple(".!?\u2026\"'\u201d\u2019\u00bb)]}*_`")
CONTEXT_CHARS = 400_000
OPENING_WORDS = 5

STYLE_INSTRUCTION = (
    "You are copy-editing a novel, one section at a time. Fix the grammar and "
    "improve the writing style: clumsy sentences, wrong words, tangled clauses, "
    "repetition, punctuation. Do not rewrite the story. The events, the names, "
    "the dialogue and the author's voice stay as they are, nothing is added and "
    "nothing is cut, and a section comes back about as long as it went in. Keep "
    "the markdown exactly as it is written, and keep every HTML comment exactly "
    "where it stands — those are the author's notes to themselves and are not "
    "yours to touch. Answer with the corrected section and nothing else: no "
    "title, no heading, no explanation, no code fence."
)

FIX_REQUEST = "Fix the writing style and the grammar in the following section."


async def fix_style(
    model: ServedCompletingModel,
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda fixed, sections: None,
    revised: Callable[[str, str], None] = lambda cell_id, source: None,
    left_alone: Callable[[str, str], None] = lambda opening, why: None,
) -> None:
    sections = [
        cell
        for cell in storydoc.cells_of(document.cells, storydoc.MARKDOWN)
        if cell.source.strip()
    ]
    if not sections:
        raise ValueError("There is no prose there to correct.")

    corrected: list[str] = []
    progress(0, len(sections))
    for fixed, section in enumerate(sections, start=1):
        if cancelled():
            return
        fix, why = await _corrected(model, corrected, section)
        if cancelled():
            return
        if why:
            left_alone(_opening(section.source), why)
        corrected.append(section.source if fix is None else fix)
        if fix is not None and fix != section.source:
            revised(section.unique_id, fix)
        progress(fixed, len(sections))


async def _corrected(
    model: ServedCompletingModel, corrected: list[str], section: Cell
) -> tuple[str | None, str]:
    answer = "".join(
        [
            chunk.content
            async for chunk in model.complete(
                [
                    {"role": "system", "content": STYLE_INSTRUCTION},
                    {"role": "user", "content": _reading(corrected, section.source)},
                ],
                max_new_tokens=len(section.source) + THINKING_HEADROOM,
                temperature=0.0,
            )
        ]
    )
    fix = _unfenced(answer).strip("\n")
    wrong = _unfinished(fix, section.source)
    return (None, wrong) if wrong else (fix, "")


def _reading(corrected: list[str], source: str) -> str:
    said: list[str] = []
    carried = _within_budget(corrected)
    if carried:
        said.append(
            "The book as far as it has been corrected, so that the voice, the "
            "tense and the names stay the same:\n"
        )
        said.extend(f"{text}\n" for text in carried)
        said.append("---\n")
    said.append(FIX_REQUEST)
    said.append(f"\n{source}")
    return "\n".join(said)


def _within_budget(corrected: list[str]) -> list[str]:
    kept: list[str] = []
    room = CONTEXT_CHARS
    for text in reversed(corrected):
        room -= len(text)
        if room < 0:
            break
        kept.append(text)
    return list(reversed(kept))


def _unfinished(fix: str, source: str) -> str:
    was, now = len(source), len(fix)
    if not was:
        return ""
    if now < SHORTEST * was or now > LONGEST * was:
        return f"it came back {now * 100 // was}% of the length it went in as"
    ended = fix.rstrip()
    if ended and ended[-1] not in _FINISHED:
        return f"it ends mid-sentence, on \u201c{ended[-40:]}\u201d"
    return ""


def _unfenced(answer: str) -> str:
    fenced = _FENCED.match(answer)
    return fenced.group("body") if fenced else answer


def _opening(source: str) -> str:
    return " ".join(source.split()[:OPENING_WORDS])


class StyleFixJob(Job):
    kind = "style fix"

    def __init__(self, model: ServedCompletingModel, document: Document) -> None:
        super().__init__(str(document.path))
        self._model = model
        self._document = document
        self.sections: list[dict[str, Any]] = []
        self.fixed = 0
        self.to_fix = 0
        self.left_alone: list[dict[str, str]] = []

    async def execute(self) -> None:
        await fix_style(
            self._model,
            self._document,
            lambda: self.cancelled,
            self._reached,
            self._revised,
            self._left_alone,
        )

    def _reached(self, fixed: int, sections: int) -> None:
        self.fixed, self.to_fix = fixed, sections

    def _revised(self, cell_id: str, source: str) -> None:
        self.sections.append({"cellId": cell_id, "source": source})

    def _left_alone(self, opening: str, why: str) -> None:
        self.left_alone.append({"opening": opening, "why": why})
