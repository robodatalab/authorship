from __future__ import annotations

import asyncio
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from server import log
from server.jobs import Job
from server.story_analysis import fake_story_plots
from server.story_analysis.story_plot import StoryPlot
from server.storydoc import Document

_log = log.logger(__name__)

FINDING_THE_PLOTS = "plots"
ATTRIBUTING_THE_PASSAGES = "paragraphs"
UPDATING_THE_PLOTS = "events"
WHAT_A_PASS_DOES = (FINDING_THE_PLOTS, ATTRIBUTING_THE_PASSAGES, UPDATING_THE_PLOTS)

PASSES = 3
A_TICK_S = 1.0
TICKS_A_STEP_TAKES = 12


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


def story_plots_told(story_plots: Sequence[StoryPlot]) -> list[dict[str, Any]]:
    return [
        {
            "title": story_plot.title,
            "characters": list(story_plot.characters),
            "origin": story_plot.origin,
            "goal": story_plot.goal,
            "keyEvents": list(story_plot.key_events),
        }
        for story_plot in story_plots
    ]


def paragraphs_in_story_plots(
    document: Document, story_plots: Sequence[StoryPlot]
) -> list[dict[str, Any]]:
    the_plots_a_line_is_in: dict[int, list[int]] = {}
    for index, story_plot in enumerate(story_plots):
        for line in story_plot.lines:
            the_plots_a_line_is_in.setdefault(line, []).append(index)
    placed: list[dict[str, Any]] = []
    for line, story_plot_indices in sorted(the_plots_a_line_is_in.items()):
        cell = document.cell_at(line)
        if cell is None:
            continue
        at = cell.offset_of(line, 0)
        placed.append(
            {
                "cellId": cell.unique_id,
                "startCharacterOffsetInCell": at,
                "endCharacterOffsetInCell": at + len(document.lines[line]),
                "wordsInTheCell": document.lines[line],
                "isVisible": True,
                "storyPlotIndices": story_plot_indices,
            }
        )
    return placed


class StoryPlotsRun:
    """One run of the algorithm in rfc/plot_identification.md, faked.

    The three methods are the three things a pass does — discovery over the
    chapters, attribution of every passage, and the key events each surviving
    plot has gathered. What each of them would ask a model, it asks
    `fake_story_plots` instead, a tick at a time so the page has something to
    draw."""

    def __init__(
        self,
        document: Document,
        cancelled: Callable[[], bool],
        progress: Callable[[StoryPlotsStep], None],
        identified: Callable[[list[dict[str, Any]], list[dict[str, Any]]], None],
    ) -> None:
        self.document = document
        self.chapters = document.chapters
        self.story_lines = list(document.story_lines())
        self.story_plots: list[StoryPlot] = []
        self._cancelled = cancelled
        self._progress = progress
        self._identified = identified

    def says_which_passes_are_to_come(self) -> None:
        for pass_to_come in range(1, PASSES + 1):
            for doing in WHAT_A_PASS_DOES:
                self._progress(StoryPlotsStep(pass_to_come, doing, 0, 0, running=False))

    async def find_the_plots_in_the_chapters(self, this_pass: int) -> None:
        for chapters_read, (title, prose) in enumerate(self.chapters, start=1):
            if self._cancelled():
                return
            fake_story_plots.found_in_a_chapter(self.story_plots, chapters_read)
            await self._tick(
                this_pass, FINDING_THE_PLOTS, chapters_read, len(self.chapters)
            )

    async def attribute_the_passages(self, this_pass: int) -> None:
        between_ticks = max(1, len(self.story_lines) // TICKS_A_STEP_TAKES)
        for lines_read, (line, written) in enumerate(self.story_lines, start=1):
            if self._cancelled():
                return
            fake_story_plots.attributed(self.story_plots, line, lines_read)
            if lines_read % between_ticks and lines_read != len(self.story_lines):
                continue
            await self._tick(
                this_pass,
                ATTRIBUTING_THE_PASSAGES,
                lines_read,
                len(self.story_lines),
            )

    async def update_the_plots_with_what_happened(self, this_pass: int) -> None:
        for plots_updated, story_plot in enumerate(self.story_plots, start=1):
            if self._cancelled():
                return
            story_plot.key_events.append(fake_story_plots.key_event(this_pass))
            await self._tick(
                this_pass, UPDATING_THE_PLOTS, plots_updated, len(self.story_plots)
            )

    async def _tick(self, this_pass: int, doing: str, done: int, of: int) -> None:
        self._progress(StoryPlotsStep(this_pass, doing, done, of))
        self._identified(
            story_plots_told(self.story_plots),
            paragraphs_in_story_plots(self.document, self.story_plots),
        )
        await asyncio.sleep(A_TICK_S)


async def identify_story_plots(
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[StoryPlotsStep], None] = lambda step: None,
    identified: Callable[
        [list[dict[str, Any]], list[dict[str, Any]]], None
    ] = lambda story_plots, paragraphs: None,
) -> None:
    run = StoryPlotsRun(document, cancelled, progress, identified)
    if not run.story_lines:
        raise ValueError("There is no prose there to find the plots in.")
    _log.info("faking the plots of %s", document.path)

    run.says_which_passes_are_to_come()
    for this_pass in range(1, PASSES + 1):
        await run.find_the_plots_in_the_chapters(this_pass)
        await run.attribute_the_passages(this_pass)
        await run.update_the_plots_with_what_happened(this_pass)


class StoryPlotsJob(Job):
    kind = "identify plots"

    def __init__(self, document: Document) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")
        self._document = document
        self.story_plots: list[dict[str, Any]] = []
        self.paragraphs_in_story_plots: list[dict[str, Any]] = []
        self._taken: dict[tuple[int, str], StoryPlotsStepTaken] = {}
        self._running: StoryPlotsStepTaken | None = None

    async def execute(self) -> None:
        try:
            await identify_story_plots(
                self._document, lambda: self.cancelled, self._reached, self._identified
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
