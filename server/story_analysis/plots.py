from __future__ import annotations

import math
import re
from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np

from server import storydoc
from server.jobs import Job
from server.storydoc import CHAPTER, MARKDOWN, PART, Document
from server.story_analysis.story_plot_classifier import ServedStoryPlotClassifier

_PARAGRAPH = re.compile(r"\S.*(?:\n[ \t]*\S.*)*")

_CLOSEST_TO_CERTAIN = 1e-6
_LOWEST_PROBABILITY_THAT_PASSES = 0.5
_ALREADY_IN_A_PLOT = "[in a plot]"


def _log_odds(probability: float) -> float:
    clipped = min(max(probability, _CLOSEST_TO_CERTAIN), 1 - _CLOSEST_TO_CERTAIN)
    return math.log(clipped / (1 - clipped))


@dataclass(frozen=True)
class StoryPlotPassLevel:
    log_odds: float
    separation: float

    def admits(self, probability: float) -> bool:
        return (
            probability >= _LOWEST_PROBABILITY_THAT_PASSES
            and _log_odds(probability) > self.log_odds
        )


def _ashman_separation(below_the_cut: np.ndarray, above_the_cut: np.ndarray) -> float:
    spread = math.sqrt(below_the_cut.var() + above_the_cut.var())
    if spread == 0:
        return math.inf
    return math.sqrt(2) * (above_the_cut.mean() - below_the_cut.mean()) / spread


def story_plot_pass_level(probabilities: Sequence[float]) -> StoryPlotPassLevel:
    scores = np.sort(np.array([_log_odds(probability) for probability in probabilities]))
    if len(scores) < 2 or scores[0] == scores[-1]:
        return StoryPlotPassLevel(math.inf, 0.0)
    counted_below = np.arange(1, len(scores))
    counted_above = len(scores) - counted_below
    summed_below = np.cumsum(scores)[:-1]
    summed_above = scores.sum() - summed_below
    variance_between_the_sides = (
        counted_below
        * counted_above
        * (summed_below / counted_below - summed_above / counted_above) ** 2
    )
    split = int(np.argmax(variance_between_the_sides)) + 1
    below_the_cut, above_the_cut = scores[:split], scores[split:]
    return StoryPlotPassLevel(
        log_odds=float((below_the_cut[-1] + above_the_cut[0]) / 2),
        separation=_ashman_separation(below_the_cut, above_the_cut),
    )


@dataclass(frozen=True)
class StoryParagraph:
    cell_id: str
    at: int
    end: int
    words: str


@dataclass(frozen=True)
class StoryPlotKeyEvent:
    what_happened: str
    found_in: int


@dataclass(frozen=True)
class StoryPlot:
    title: str
    characters: tuple[str, ...]
    origin: str
    goal: str
    key_events: tuple[StoryPlotKeyEvent, ...] = ()


def story_paragraphs(document: Document) -> list[StoryParagraph]:
    return [
        StoryParagraph(cell.unique_id, found.start(), found.end(), found.group())
        for cell in storydoc.cells_of(document.cells, MARKDOWN)
        for found in _PARAGRAPH.finditer(cell.source)
    ]


def the_story(
    paragraphs: Sequence[StoryParagraph], in_a_plot: Collection[int] = ()
) -> str:
    return "\n\n".join(
        f"{_ALREADY_IN_A_PLOT} {paragraph.words}"
        if index in in_a_plot
        else paragraph.words
        for index, paragraph in enumerate(paragraphs)
    )


def story_plot_summary(
    plot: StoryPlot, except_events_found_in: int | None = None
) -> str:
    happened = [
        event.what_happened
        for event in plot.key_events
        if event.found_in != except_events_found_in
    ]
    return "\n".join(
        [
            f"Who is in it: {', '.join(plot.characters)}",
            f"How it began: {plot.origin}",
            f"Where it is heading: {plot.goal}",
            "What has happened along it: "
            + ("; ".join(happened) if happened else "nothing recorded yet"),
        ]
    )


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
    model: ServedStoryPlotClassifier,
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

    def __init__(self, model: ServedStoryPlotClassifier, document: Document) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")
        self._model = model
        self._document = document
        self.story_plots: list[dict[str, Any]] = []
        self.paragraphs_in_story_plots: list[dict[str, Any]] = []
        self.identified = 0
        self.to_identify = 0

    async def execute(self) -> None:
        identify_story_plots(
            self._model,
            self._document,
            lambda: self.cancelled,
            self._reached,
            self._named,
            self.paragraphs_in_story_plots.append,
        )

    def _reached(self, identified: int, sections: int) -> None:
        self.identified, self.to_identify = identified, sections

    def _named(self, story_plots: list[dict[str, Any]]) -> None:
        self.story_plots = story_plots
