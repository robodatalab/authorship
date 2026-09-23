from __future__ import annotations

import asyncio
import json
import math
import re
import time
from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass, replace
from itertools import combinations
from typing import Any

import numpy as np
from cortexgrid_infer import ServedCompletingModel

from server import log, storydoc
from server.jobs import Job
from server.models import cluster
from server.storydoc import MARKDOWN, Document
from server.story_analysis.story_plot_classifier import (
    ServedStoryPlotClassifier,
    StoryPlotQuestion,
)

_log = log.logger(__name__)

_PARAGRAPH = re.compile(r"\S.*(?:\n[ \t]*\S.*)*")

_CLOSEST_TO_CERTAIN = 1e-6
_LOWEST_PROBABILITY_THAT_PASSES = 0.5
_ALREADY_IN_A_PLOT = "[in a plot]"
_SEPARATION_A_REAL_PLOT_SHOWS = 4.0
_OVERLAP_THAT_MAKES_ONE_PLOT = 0.7
_FENCED = re.compile(r"```[a-zA-Z]*\n(.*?)\n```", re.DOTALL)

THINKING_HEADROOM = 8192
STORY_PLOTS_TOKENS = 1024
POOLED_STORY_PLOTS_TOKENS = 3072
MOST_PLOTS_A_STORY_HAS = 10
PARAGRAPHS_READ_FOR_KEY_EVENTS = 40
PARAGRAPHS_SCORED_AT_A_TIME = 25
CHAPTERS_READ_AT_A_TIME = 8
STORY_PLOT_KEY_EVENTS_TOKENS = 1200


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


@dataclass(frozen=True)
class StoryPlotClaim:
    plot: StoryPlot
    paragraphs: frozenset[int]
    separation: float


async def story_plot_probabilities(
    classifier: ServedStoryPlotClassifier,
    story: str,
    paragraphs: Sequence[StoryParagraph],
    plot: StoryPlot,
    scored: Callable[[int], None] = lambda paragraphs: None,
) -> list[float]:
    probabilities: list[float] = []
    for first in range(0, len(paragraphs), PARAGRAPHS_SCORED_AT_A_TIME):
        asked_now = list(
            enumerate(
                paragraphs[first : first + PARAGRAPHS_SCORED_AT_A_TIME], start=first
            )
        )
        probabilities.extend(
            await classifier.probabilities(
                story,
                [
                    StoryPlotQuestion(
                        plot=f"{plot.title}\n"
                        f"{story_plot_summary(plot, except_events_found_in=index)}",
                        paragraph=paragraph.words,
                    )
                    for index, paragraph in asked_now
                ],
            )
        )
        scored(len(asked_now))
    return probabilities


async def one_pass(
    classifier: ServedStoryPlotClassifier,
    story: str,
    paragraphs: Sequence[StoryParagraph],
    plots: Sequence[StoryPlot],
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda scored, to_score: None,
    claimed: Callable[[list[StoryPlotClaim]], None] = lambda sofar: None,
) -> list[StoryPlotClaim]:
    claims: list[StoryPlotClaim] = []
    to_score = len(paragraphs) * len(plots)
    scored_so_far = 0
    progress(0, to_score)

    def scored(paragraphs_now: int) -> None:
        nonlocal scored_so_far
        scored_so_far += paragraphs_now
        progress(scored_so_far, to_score)

    for plot in plots:
        if cancelled():
            return []
        probabilities = await story_plot_probabilities(
            classifier, story, paragraphs, plot, scored
        )
        pass_level = story_plot_pass_level(probabilities)
        claims.append(
            StoryPlotClaim(
                plot=plot,
                paragraphs=frozenset(
                    index
                    for index, probability in enumerate(probabilities)
                    if pass_level.admits(probability)
                ),
                separation=pass_level.separation,
            )
        )
        claimed(list(claims))
    return united(
        [
            claim
            for claim in claims
            if claim.paragraphs and claim.separation >= _SEPARATION_A_REAL_PLOT_SHOWS
        ]
    )


def united(claims: Sequence[StoryPlotClaim]) -> list[StoryPlotClaim]:
    plots = list(claims)
    uniting = True
    while uniting:
        uniting = False
        for one, another in combinations(range(len(plots)), 2):
            if (
                _overlap(plots[one].paragraphs, plots[another].paragraphs)
                > _OVERLAP_THAT_MAKES_ONE_PLOT
            ):
                plots[one] = _one_plot_of(plots[one], plots[another])
                del plots[another]
                uniting = True
                break
    return plots


def _overlap(one: frozenset[int], another: frozenset[int]) -> float:
    told_apart = one | another
    return len(one & another) / len(told_apart) if told_apart else 0.0


def _one_plot_of(one: StoryPlotClaim, another: StoryPlotClaim) -> StoryPlotClaim:
    told, absorbed = sorted(
        [one, another], key=lambda claim: claim.separation, reverse=True
    )
    return StoryPlotClaim(
        plot=replace(
            told.plot,
            characters=tuple(
                dict.fromkeys(told.plot.characters + absorbed.plot.characters)
            ),
            key_events=tuple(
                dict.fromkeys(told.plot.key_events + absorbed.plot.key_events)
            ),
        ),
        paragraphs=told.paragraphs | absorbed.paragraphs,
        separation=told.separation,
    )


STORY_PLOT_DISCOVERY_INSTRUCTION = (
    "You read a novel and say what plots run through it. A plot is a thread the "
    "story follows: who takes part in it, how it began, and where it is heading. "
    "The people in it are named as the story names them, and a plot is told as a "
    "thread of the whole book rather than of the page it is read on. Answer with "
    'JSON and nothing else: a list of objects with the keys "title", '
    '"characters", "origin" and "goal", where "characters" is a list of names '
    "and the rest are one sentence each."
)

CHAPTER_PLOT_REQUEST = (
    "Name the one plot this chapter carries - the main theme it turns on."
)

UNCLAIMED_PLOTS_REQUEST = (
    "The paragraphs marked [in a plot] belong to a plot that has been found "
    "already. Name the plots that account for the paragraphs that are not "
    "marked. A plot you name may run through marked paragraphs too - the "
    "unmarked ones are what is missing from the plots found so far. Paragraphs "
    "that belong to no plot at all, such as the scenery a scene stands in, need "
    "no plot naming them."
)

STORY_PLOT_POOLING_INSTRUCTION = (
    "You are given the plots proposed for one novel, chapter by chapter, so the "
    "same thread is proposed many times over in different words. Pool them into "
    "the threads the book actually has, each said once: unite the characters, "
    "take the origin from the earliest proposal of that thread and the goal "
    "from the furthest, and keep a thread that is proposed only once if nothing "
    "else is that thread under another name. No novel runs more threads than a "
    "reader can hold. Answer with JSON and nothing else: a list of objects with "
    'the keys "title", "characters", "origin" and "goal".'
)

STORY_PLOT_KEY_EVENTS_INSTRUCTION = (
    "You read one plot of a novel and the numbered paragraphs that belong to it. "
    "Say what happens along the plot in them: one sentence for each paragraph "
    "that moves the thread on, in the story's own names. A paragraph that shows "
    "the plot without moving it on gets none. Answer with JSON and nothing else: "
    'a list of objects with the keys "paragraph", the number it is read in, and '
    '"what_happened".'
)


async def story_plots_in_the_chapters(
    model: ServedCompletingModel,
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    read: Callable[[int, int], None] = lambda chapters_read, chapters: None,
) -> list[StoryPlot]:
    chapters = document.chapters
    read(0, len(chapters))
    one_at_a_time = asyncio.Semaphore(CHAPTERS_READ_AT_A_TIME)
    chapters_read = 0

    async def plots_in(title: str, prose: str) -> list[StoryPlot]:
        nonlocal chapters_read
        async with one_at_a_time:
            if cancelled():
                return []
            named = _story_plots_named(
                await _answered(
                    model,
                    STORY_PLOT_DISCOVERY_INSTRUCTION,
                    f'The chapter "{title}":\n\n{prose}\n\n{CHAPTER_PLOT_REQUEST}',
                    STORY_PLOTS_TOKENS,
                )
            )
        chapters_read += 1
        read(chapters_read, len(chapters))
        return named

    return [
        plot
        for named in await asyncio.gather(
            *(plots_in(title, prose) for title, prose in chapters)
        )
        for plot in named
    ]


async def story_plots_pooled(
    model: ServedCompletingModel, plots: Sequence[StoryPlot], at_most: int
) -> list[StoryPlot]:
    if at_most <= 0:
        return []
    if len(plots) <= at_most:
        return list(plots)
    written = "\n\n".join(
        f"{plot.title}\n{story_plot_summary(plot)}" for plot in plots
    )
    return _story_plots_named(
        await _answered(
            model,
            STORY_PLOT_POOLING_INSTRUCTION,
            f"The plots proposed:\n\n{written}\n\n"
            f"Pool them into at most {at_most} plots.",
            POOLED_STORY_PLOTS_TOKENS,
        )
    )


async def story_plots_in_what_no_plot_claims(
    model: ServedCompletingModel,
    paragraphs: Sequence[StoryParagraph],
    in_a_plot: Collection[int],
) -> list[StoryPlot]:
    return _story_plots_named(
        await _answered(
            model,
            STORY_PLOT_DISCOVERY_INSTRUCTION,
            f"{the_story(paragraphs, in_a_plot)}\n\n{UNCLAIMED_PLOTS_REQUEST}",
            STORY_PLOTS_TOKENS,
        )
    )


async def story_plot_key_events(
    model: ServedCompletingModel,
    plot: StoryPlot,
    paragraphs: Sequence[StoryParagraph],
    claimed: Collection[int],
) -> tuple[StoryPlotKeyEvent, ...]:
    in_the_plot = sorted(claimed)
    found: list[StoryPlotKeyEvent] = []
    for first in range(0, len(in_the_plot), PARAGRAPHS_READ_FOR_KEY_EVENTS):
        read_now = set(in_the_plot[first : first + PARAGRAPHS_READ_FOR_KEY_EVENTS])
        read = "\n\n".join(
            f"{index}. {paragraphs[index].words}" for index in sorted(read_now)
        )
        happened = await _answered(
            model,
            STORY_PLOT_KEY_EVENTS_INSTRUCTION,
            f"The plot:\n{plot.title}\n{story_plot_summary(plot)}\n\n"
            f"Its paragraphs:\n\n{read}",
            STORY_PLOT_KEY_EVENTS_TOKENS,
        )
        found.extend(
            StoryPlotKeyEvent(str(event["what_happened"]), int(event["paragraph"]))
            for event in happened
            if int(event["paragraph"]) in read_now
        )
    return tuple(found)


@cluster.waiting_for_the_model
async def _answered(
    model: ServedCompletingModel, instruction: str, read: str, tokens: int
) -> Any:
    answer = "".join(
        [
            chunk.content
            async for chunk in model.complete(
                [
                    {"role": "system", "content": instruction},
                    {"role": "user", "content": read},
                ],
                max_new_tokens=tokens + THINKING_HEADROOM,
                temperature=0.0,
            )
        ]
    ).strip()
    return _json_in(answer)


def _json_in(answer: str) -> Any:
    fenced = _FENCED.search(answer)
    written = fenced.group(1) if fenced else answer
    begins = [where for where in (written.find("["), written.find("{")) if where != -1]
    if begins:
        try:
            found, _ = json.JSONDecoder().raw_decode(written[min(begins) :])
            return found
        except json.JSONDecodeError:
            pass
    raise ValueError(
        "The model answered with no JSON in it: "
        f"{answer[:200] if answer else 'nothing at all'}"
    )


def _story_plots_named(answered: Any) -> list[StoryPlot]:
    return [
        StoryPlot(
            title=str(plot["title"]),
            characters=tuple(str(character) for character in plot["characters"]),
            origin=str(plot["origin"]),
            goal=str(plot["goal"]),
        )
        for plot in (answered if isinstance(answered, list) else [answered])
    ]


FINDING_THE_PLOTS = "plots"
ATTRIBUTING_THE_PASSAGES = "paragraphs"
UPDATING_THE_PLOTS = "events"


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


_PASSES_AT_MOST = 10
_REASSIGNMENTS_OF_A_SETTLED_STORY = 0.02
_PASSES_THAT_MUST_AGREE = 3


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

    story = the_story(paragraphs)
    plots = await story_plots_in_the_chapters(
        discovery_model,
        document,
        cancelled,
        lambda chapters_read, chapters: progress(
            StoryPlotsStep(1, FINDING_THE_PLOTS, chapters_read, chapters)
        ),
    )
    _log.info("%d plots proposed by the chapters of %s", len(plots), document.path)
    plots = await story_plots_pooled(discovery_model, plots, MOST_PLOTS_A_STORY_HAS)
    _log.info("pooled into %d plots", len(plots))
    identified(_story_plots_told(plots), [])
    claims: list[StoryPlotClaim] = []
    reassignments: list[int] = []
    for passes in range(1, _PASSES_AT_MOST + 1):
        if cancelled():
            return
        _log.info(
            "pass %d scoring %d paragraphs against %d plots",
            passes,
            len(paragraphs),
            len(plots),
        )
        progress(
            StoryPlotsStep(
                passes,
                ATTRIBUTING_THE_PASSAGES,
                0,
                len(paragraphs) * len(plots),
                running=False,
            )
        )
        progress(
            StoryPlotsStep(passes, UPDATING_THE_PLOTS, 0, len(plots), running=False)
        )
        scored = await one_pass(
            classifier,
            story,
            paragraphs,
            plots,
            cancelled,
            lambda read, to_read: progress(
                StoryPlotsStep(passes, ATTRIBUTING_THE_PASSAGES, read, to_read)
            ),
            lambda sofar: identified(
                _story_plots_told(plots),
                _paragraphs_in_story_plots(sofar, paragraphs),
            ),
        )
        if cancelled():
            return
        reassignments.append(_reassignments(claims, scored))
        _log.info(
            "pass %d kept %d of %d plots, with %d reassignments",
            passes,
            len(scored),
            len(plots),
            reassignments[-1],
        )
        claims = []
        progress(StoryPlotsStep(passes, UPDATING_THE_PLOTS, 0, len(scored)))
        for claim in scored:
            claims.append(
                replace(
                    claim,
                    plot=replace(
                        claim.plot,
                        key_events=_key_events_of(
                            claim,
                            await story_plot_key_events(
                                discovery_model, claim.plot, paragraphs, claim.paragraphs
                            ),
                        ),
                    ),
                )
            )
            progress(
                StoryPlotsStep(passes, UPDATING_THE_PLOTS, len(claims), len(scored))
            )
        identified(
            _story_plots_told([claim.plot for claim in claims]),
            _paragraphs_in_story_plots(claims, paragraphs),
        )
        if _settled(reassignments, len(paragraphs)):
            return
        progress(StoryPlotsStep(passes + 1, FINDING_THE_PLOTS, 0, 1))
        found = await story_plots_in_what_no_plot_claims(
            discovery_model, paragraphs, _claimed(claims)
        )
        plots = [claim.plot for claim in claims] + await story_plots_pooled(
            discovery_model, found, MOST_PLOTS_A_STORY_HAS - len(claims)
        )
        progress(StoryPlotsStep(passes + 1, FINDING_THE_PLOTS, 1, 1))
        identified(
            _story_plots_told(plots),
            _paragraphs_in_story_plots(claims, paragraphs),
        )


def _key_events_of(
    claim: StoryPlotClaim, found: tuple[StoryPlotKeyEvent, ...]
) -> tuple[StoryPlotKeyEvent, ...]:
    return tuple(
        dict.fromkeys(
            tuple(
                event
                for event in claim.plot.key_events
                if event.found_in in claim.paragraphs
            )
            + found
        )
    )


def _claimed(claims: Sequence[StoryPlotClaim]) -> set[int]:
    return {paragraph for claim in claims for paragraph in claim.paragraphs}


def _reassignments(
    before: Sequence[StoryPlotClaim], after: Sequence[StoryPlotClaim]
) -> int:
    was = {
        (claim.plot.title, paragraph)
        for claim in before
        for paragraph in claim.paragraphs
    }
    now = {
        (claim.plot.title, paragraph)
        for claim in after
        for paragraph in claim.paragraphs
    }
    return len(was ^ now)


def _settled(reassignments: Sequence[int], paragraphs: int) -> bool:
    if len(reassignments) < _PASSES_THAT_MUST_AGREE:
        return False
    return (
        max(reassignments[-_PASSES_THAT_MUST_AGREE:])
        <= paragraphs * _REASSIGNMENTS_OF_A_SETTLED_STORY
    )


def _story_plots_told(plots: Sequence[StoryPlot]) -> list[dict[str, Any]]:
    return [
        {
            "title": plot.title,
            "characters": list(plot.characters),
            "origin": plot.origin,
            "goal": plot.goal,
            "keyEvents": [event.what_happened for event in plot.key_events],
        }
        for plot in plots
    ]


def _paragraphs_in_story_plots(
    claims: Sequence[StoryPlotClaim], paragraphs: Sequence[StoryParagraph]
) -> list[dict[str, Any]]:
    in_story_plots: dict[int, list[int]] = {}
    for index, claim in enumerate(claims):
        for paragraph in sorted(claim.paragraphs):
            in_story_plots.setdefault(paragraph, []).append(index)
    return [
        {
            "cellId": paragraphs[paragraph].cell_id,
            "startCharacterOffsetInCell": paragraphs[paragraph].at,
            "endCharacterOffsetInCell": paragraphs[paragraph].end,
            "wordsInTheCell": paragraphs[paragraph].words,
            "isVisible": True,
            "storyPlotIndices": story_plot_indices,
        }
        for paragraph, story_plot_indices in sorted(in_story_plots.items())
    ]


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
