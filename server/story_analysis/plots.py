from __future__ import annotations

import asyncio
import re
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from cortexgrid_infer import ServedCompletingModel

from server import log, storydoc
from server.jobs import Job
from server.storydoc import MARKDOWN, Document
from server.story_analysis.story_plot_classifier import ServedStoryPlotClassifier

_log = log.logger(__name__)

_PARAGRAPH = re.compile(r"\S.*(?:\n[ \t]*\S.*)*")

FINDING_THE_PLOTS = "plots"
ATTRIBUTING_THE_PASSAGES = "paragraphs"
UPDATING_THE_PLOTS = "events"

A_TICK_S = 1.0
TICKS_IN_A_STEP = 12
PASSES = 3

FAKE_STORY_PLOTS: list[dict[str, Any]] = [
    {
        "title": "The fall of the numbers",
        "characters": ["Diane", "Josh"],
        "origin": "Fake data. A decline nobody wants to own",
        "goal": "Someone is made to answer for it",
        "keyEvents": [],
    },
    {
        "title": "The rivalry at the top",
        "characters": ["Diane", "Geoffrey"],
        "origin": "Fake data. Two people who need each other",
        "goal": "One of them is left holding the company",
        "keyEvents": [],
    },
    {
        "title": "The thing in the servers",
        "characters": ["Josh", "Mara"],
        "origin": "Fake data. Something is changing the platform",
        "goal": "The people nobody listens to are believed",
        "keyEvents": [],
    },
    {
        "title": "The way home",
        "characters": ["Diane"],
        "origin": "Fake data. A private life kept at arm's length",
        "goal": "It stops being kept there",
        "keyEvents": [],
    },
    {
        "title": "The bill and the Senate",
        "characters": ["Geoffrey", "Carlile"],
        "origin": "Fake data. A law written for one company",
        "goal": "It passes, or the man who wrote it falls",
        "keyEvents": [],
    },
    {
        "title": "The week the world changed",
        "characters": ["The narrator"],
        "origin": "Fake data. Seven days nobody can account for",
        "goal": "The story of them is written down",
        "keyEvents": [],
    },
]

FAKE_KEY_EVENTS = [
    "Fake data. The meeting where it was first said out loud",
    "Fake data. The night it could no longer be explained away",
    "Fake data. The call that made it somebody's fault",
]


@dataclass(frozen=True)
class StoryParagraph:
    cell_id: str
    at: int
    end: int
    words: str


@dataclass(frozen=True)
class StoryPlotsStep:
    passes: int
    doing: str
    done: int
    of: int
    running: bool = True


@dataclass
class StoryPlotsStepTaken:
    step: StoryPlotsStep
    began: float | None = None
    ended: float | None = None

    def how_far_along(self, now: float) -> dict[str, Any]:
        return {
            "passes": self.step.passes,
            "doing": self.step.doing,
            "done": self.step.done,
            "of": self.step.of,
            "seconds": 0.0
            if self.began is None
            else round((self.ended if self.ended is not None else now) - self.began, 1),
            "state": "waiting"
            if self.began is None
            else "running"
            if self.ended is None
            else "done",
        }


def story_paragraphs(document: Document) -> list[StoryParagraph]:
    return [
        StoryParagraph(cell.unique_id, found.start(), found.end(), found.group())
        for cell in storydoc.cells_of(document.cells, MARKDOWN)
        for found in _PARAGRAPH.finditer(cell.source)
    ]


def story_plot_indices(paragraph: int, plots: int) -> list[int]:
    if plots == 0:
        return []
    beat = paragraph % 12
    if beat == 11:
        return []
    leading = (paragraph // 12) % plots
    if 4 <= beat <= 7:
        return sorted({leading, (leading + 1) % plots})
    return [leading]


def paragraphs_in_story_plots(
    paragraphs: Sequence[StoryParagraph], attributed: int, plots: int
) -> list[dict[str, Any]]:
    told: list[dict[str, Any]] = []
    for index, paragraph in enumerate(paragraphs[:attributed]):
        indices = story_plot_indices(index, plots)
        if not indices:
            continue
        told.append(
            {
                "cellId": paragraph.cell_id,
                "startCharacterOffsetInCell": paragraph.at,
                "endCharacterOffsetInCell": paragraph.end,
                "wordsInTheCell": paragraph.words,
                "isVisible": True,
                "storyPlotIndices": indices,
            }
        )
    return told


async def identify_story_plots(
    discovery_model: ServedCompletingModel,
    classifier: ServedStoryPlotClassifier,
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[StoryPlotsStep], None] = lambda step: None,
    identified: Callable[
        [list[dict[str, Any]], list[dict[str, Any]]], None
    ] = lambda story_plots, paragraphs: None,
) -> None:
    paragraphs = story_paragraphs(document)
    if not paragraphs:
        raise ValueError("There is no prose there to find the plots in.")

    _log.info("faking the plots of %s", document.path)
    plots: list[dict[str, Any]] = []
    for passes in range(1, PASSES + 1):
        chapters = max(len(document.chapters), TICKS_IN_A_STEP) if passes == 1 else 2
        for read in range(1, chapters + 1):
            if cancelled():
                return
            progress(StoryPlotsStep(passes, FINDING_THE_PLOTS, read, chapters))
            named = len(FAKE_STORY_PLOTS) * read // chapters if passes == 1 else 0
            while len(plots) < named:
                plots.append(dict(FAKE_STORY_PLOTS[len(plots)]))
            if passes > 1 and read == chapters and len(plots) > 1:
                plots.pop()
            identified(list(plots), paragraphs_in_story_plots(paragraphs, 0, len(plots)))
            await asyncio.sleep(A_TICK_S)

        to_attribute = len(paragraphs) * len(plots)
        progress(
            StoryPlotsStep(
                passes, ATTRIBUTING_THE_PASSAGES, 0, to_attribute, running=False
            )
        )
        progress(
            StoryPlotsStep(passes, UPDATING_THE_PLOTS, 0, len(plots), running=False)
        )
        for tick in range(1, TICKS_IN_A_STEP + 1):
            if cancelled():
                return
            attributed = to_attribute * tick // TICKS_IN_A_STEP
            progress(
                StoryPlotsStep(
                    passes, ATTRIBUTING_THE_PASSAGES, attributed, to_attribute
                )
            )
            identified(
                list(plots),
                paragraphs_in_story_plots(
                    paragraphs, len(paragraphs) * tick // TICKS_IN_A_STEP, len(plots)
                ),
            )
            await asyncio.sleep(A_TICK_S)

        for updated, plot in enumerate(plots, start=1):
            if cancelled():
                return
            plot["keyEvents"] = [
                *plot["keyEvents"],
                FAKE_KEY_EVENTS[(passes - 1) % len(FAKE_KEY_EVENTS)],
            ]
            progress(
                StoryPlotsStep(passes, UPDATING_THE_PLOTS, updated, len(plots))
            )
            identified(
                list(plots),
                paragraphs_in_story_plots(paragraphs, len(paragraphs), len(plots)),
            )
            await asyncio.sleep(A_TICK_S)


class StoryPlotsJob(Job):
    kind = "identify plots"

    def __init__(
        self,
        discovery_model: ServedCompletingModel,
        classifier: ServedStoryPlotClassifier,
        document: Document,
    ) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")
        self._discovery_model = discovery_model
        self._classifier = classifier
        self._document = document
        self.story_plots: list[dict[str, Any]] = []
        self.paragraphs_in_story_plots: list[dict[str, Any]] = []
        self._taken: dict[tuple[int, str], StoryPlotsStepTaken] = {}
        self._running: StoryPlotsStepTaken | None = None

    async def execute(self) -> None:
        try:
            await identify_story_plots(
                self._discovery_model,
                self._classifier,
                self._document,
                lambda: self.cancelled,
                self._reached,
                self._identified,
            )
        finally:
            self._stopped_working()

    def how_far_along(self) -> list[dict[str, Any]]:
        now = time.monotonic()
        return [taken.how_far_along(now) for taken in self._taken.values()]

    def _reached(self, step: StoryPlotsStep) -> None:
        taken = self._taken.setdefault(
            (step.passes, step.doing), StoryPlotsStepTaken(step)
        )
        taken.step = step
        if not step.running or taken is self._running:
            return
        self._stopped_working()
        taken.began, taken.ended = time.monotonic(), None
        self._running = taken

    def _stopped_working(self) -> None:
        if self._running is not None:
            self._running.ended = time.monotonic()
            self._running = None

    def _identified(
        self, story_plots: list[dict[str, Any]], paragraphs: list[dict[str, Any]]
    ) -> None:
        self.story_plots, self.paragraphs_in_story_plots = story_plots, paragraphs
