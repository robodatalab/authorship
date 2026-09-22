from __future__ import annotations

import re
from typing import Any

from server.jobs import Job
from server.storydoc import CHAPTER, MARKDOWN, PART, Document

_PARAGRAPH = re.compile(r"\S.*(?:\n[ \t]*\S.*)*")

_FAKE_STORY_PLOTS = [
    {
        "title": "The fall of the numbers",
        "summary": "Fake data. A slow decline that nobody wants to own, "
        "reported upwards one meeting at a time until it can no longer be "
        "explained away.",
    },
    {
        "title": "The rivalry at the top",
        "summary": "Fake data. Two people who need each other and trust "
        "each other less with every chapter, each waiting for the other to "
        "make the first mistake.",
    },
    {
        "title": "The thing in the servers",
        "summary": "Fake data. Something is changing the platform from the "
        "inside, and the only people who notice are the ones nobody listens to.",
    },
    {
        "title": "The way home",
        "summary": "Fake data. A private life kept at arm's length, which "
        "keeps finding its way back into the working day.",
    },
]


def _fake_story_plot_indices(section: int, paragraph: int) -> list[int]:
    beat = paragraph % 12
    if beat == 11:
        return []
    leading = section % len(_FAKE_STORY_PLOTS)
    indices = [leading]
    if 4 <= beat <= 7:
        indices.append((leading + 1) % len(_FAKE_STORY_PLOTS))
    if beat in (6, 7):
        indices.append((leading + 2) % len(_FAKE_STORY_PLOTS))
    return indices


def identify_story_plots(
    document: Document,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    paragraphs_in_story_plots: list[dict[str, Any]] = []
    section = 0
    paragraph = 0
    for cell in document.cells:
        if cell.kind in (PART, CHAPTER):
            section += 1
            paragraph = 0
            continue
        if cell.kind != MARKDOWN:
            continue
        for found in _PARAGRAPH.finditer(cell.source):
            story_plot_indices = _fake_story_plot_indices(section, paragraph)
            paragraph += 1
            if not story_plot_indices:
                continue
            paragraphs_in_story_plots.append(
                {
                    "cellId": cell.unique_id,
                    "startCharacterOffsetInCell": found.start(),
                    "endCharacterOffsetInCell": found.end(),
                    "wordsInTheCell": found.group(),
                    "isVisible": True,
                    "storyPlotIndices": story_plot_indices,
                }
            )
    return list(_FAKE_STORY_PLOTS), paragraphs_in_story_plots


class StoryPlotsJob(Job):
    kind = "identify plots"

    def __init__(self, document: Document) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")
        self._document = document
        self.story_plots: list[dict[str, Any]] = []
        self.paragraphs_in_story_plots: list[dict[str, Any]] = []

    def execute(self) -> None:
        self.story_plots, self.paragraphs_in_story_plots = identify_story_plots(
            self._document
        )
