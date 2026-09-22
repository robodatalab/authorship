from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from server import storydoc
from server.jobs import Job
from server.models.gemini import Gemini, GeminiError
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


def _fake_story_plot_indices(part_or_chapter: int, paragraph: int) -> list[int]:
    beat = paragraph % 12
    if beat == 11:
        return []
    leading = part_or_chapter % len(_FAKE_STORY_PLOTS)
    indices = [leading]
    if 4 <= beat <= 7:
        indices.append((leading + 1) % len(_FAKE_STORY_PLOTS))
    if beat in (6, 7):
        indices.append((leading + 2) % len(_FAKE_STORY_PLOTS))
    return indices


def identify_story_plots(
    model: Gemini,
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda identified, sections: None,
    plots_named: Callable[[list[dict[str, Any]]], None] = lambda story_plots: None,
    paragraph_placed: Callable[[dict[str, Any]], None] = lambda paragraph: None,
) -> None:
    sections = [
        cell
        for cell in storydoc.cells_of(document.cells, MARKDOWN)
        if cell.source.strip()
    ]
    if not sections:
        raise ValueError("There is no prose there to find the plots in.")

    plots_named(list(_FAKE_STORY_PLOTS))
    progress(0, len(sections))
    identified = 0
    part_or_chapter = 0
    paragraph = 0
    for cell in document.cells:
        if cell.kind in (PART, CHAPTER):
            part_or_chapter += 1
            paragraph = 0
            continue
        if cell.kind != MARKDOWN or not cell.source.strip():
            continue
        if cancelled():
            return
        for found in _PARAGRAPH.finditer(cell.source):
            story_plot_indices = _fake_story_plot_indices(part_or_chapter, paragraph)
            paragraph += 1
            if story_plot_indices:
                paragraph_placed(
                    {
                        "cellId": cell.unique_id,
                        "startCharacterOffsetInCell": found.start(),
                        "endCharacterOffsetInCell": found.end(),
                        "wordsInTheCell": found.group(),
                        "isVisible": True,
                        "storyPlotIndices": story_plot_indices,
                    }
                )
        identified += 1
        progress(identified, len(sections))


class StoryPlotsJob(Job):
    kind = "identify plots"

    def __init__(self, model: Gemini, document: Document) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")
        self._model = model
        self._document = document
        self.story_plots: list[dict[str, Any]] = []
        self.paragraphs_in_story_plots: list[dict[str, Any]] = []
        self.identified = 0
        self.to_identify = 0
        self.unauthorized = False
        self.no_quota = False

    def execute(self) -> None:
        try:
            identify_story_plots(
                self._model,
                self._document,
                lambda: self.cancelled,
                self._reached,
                self._named,
                self.paragraphs_in_story_plots.append,
            )
        except GeminiError as err:
            self.unauthorized = err.unauthorized
            self.no_quota = err.no_quota
            raise

    def _reached(self, identified: int, sections: int) -> None:
        self.identified, self.to_identify = identified, sections

    def _named(self, story_plots: list[dict[str, Any]]) -> None:
        self.story_plots = story_plots
