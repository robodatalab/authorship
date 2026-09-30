from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from cortexgrid_infer import CompletionChunk, ServedCompletingModel
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from server import log
from server.jobs import Job
from server.progress import with_progress
from server.models.causal_event_trajectory_classifier import (
    ServedCausalEventTrajectoryClassifier,
)
from server.models.story_state import StoryState
from server.models.story_state_extraction_model import ServedStoryStateExtractionModel
from server.storydoc import Document
from server.utils import estimate_num_tokens_in_text

_log = log.logger(__name__)

EVENT_PROMPT = """
Given numbered lines in format <line index>.<line>, return an event that is described in that line.
An event describes something that happens to something or somewhere. 

Examples:

1. The staircase opens to a windowless cavern lit by a set of dimmed fluorescent lights. Their luminosity can be changed from blinding white to pitch black - settings my Owner often explores. I increase the brighness to allow me to see every little detail well, and begin the rounds.  -> 1. He turned up the lights in room
2. I take the broom and begin wiping the floors. The motion kicks up the dust and I begin coughing. -> 2. He cleans the room.
3. Suddenly, I heard footsteps on the staircase - light, calculated. I recognized them immediately. She walked in, holding her head up high. -> 3. She enters the room that he cleans.
"""

async def answered_lines(chunks: AsyncIterator[CompletionChunk]) -> AsyncIterator[str]:
    pending = ""
    async for chunk in chunks:
        pending += chunk.content
        *finished, pending = pending.split("\n")
        for line in finished:
            yield line
    if pending:
        yield pending


@dataclass
class StoryEvent:
    description: str
    position_in_manuscript: int


async def detect_events(document: Document, causal_model: ServedCompletingModel) -> list[StoryEvent]:
    max_chapter_length = max(estimate_num_tokens_in_text(chapter) for _, chapter in document.chapters)

    all_events: list[StoryEvent] = []
    lines_before_chapter = 0
    for _, chapter in with_progress(document.chapters, "detecting events"):
        lines = [line for line in chapter.splitlines() if line]
        numbered_lines = "\n".join([f"{idx}. {line}" for idx, line in enumerate(lines)])
        async for answer in with_progress(
            answered_lines(causal_model.complete(
                [
                    {"role": "system", "content": EVENT_PROMPT},
                    {"role": "user", "content": numbered_lines},
                ],
                max_new_tokens=max_chapter_length,
                temperature=0.0,
            )),
            "detecting the events in the chapter",
            of=len(lines),
        ):
            index, _, description = answer.partition(". ")
            all_events.append(StoryEvent(description, lines_before_chapter + int(index)))
        lines_before_chapter += len(lines)

    return all_events


class StoryPlot(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    title: str
    characters: list[str]
    origin: str
    goal: str
    key_events: list[str]


SAME_SITUATION_PROBABILITY = 0.5


async def stitch_events_into_causal_trajectory(
    events: list[StoryEvent],
    story: str,
    causal_event_trajectory_classifier: ServedCausalEventTrajectoryClassifier,
) -> list[StoryPlot]:
    """Takes a list of events and groups them into plots."""
    pairs_of_next_events = [
        (previous.description, event.description) for previous, event in zip(events, events[1:])
    ]
    probabilities_for_next_events = causal_event_trajectory_classifier.same_situation_probabilities(
        story, pairs_of_next_events
    )
    same_situation_as_previous = [
        probability
        async for probability in with_progress(
            probabilities_for_next_events,
            "measuring whether each event continues the situation of the one before",
            of=len(pairs_of_next_events),
        )
    ]
    runs = [[event] for event in events[:1]]
    for next_event, probability in zip(events[1:], same_situation_as_previous):
        if probability > SAME_SITUATION_PROBABILITY:
            runs[-1].append(next_event)
        else:
            runs.append([next_event])

    links_between_runs = [
        (from_run, to_run)
        for from_run in range(len(runs))
        for to_run in range(len(runs))
        if from_run != to_run
    ]
    pairs_across_runs = [
        (runs[from_run][-1].description, runs[to_run][0].description)
        for from_run, to_run in links_between_runs
    ]
    probabilities_across_runs = causal_event_trajectory_classifier.same_situation_probabilities(
        story, pairs_across_runs
    )
    same_situation_across_runs = [
        probability
        async for probability in with_progress(
            probabilities_across_runs,
            "measuring whether each run of events continues the situation of the others",
            of=len(pairs_across_runs),
        )
    ]
    run_after: dict[int, int] = {}
    run_before: dict[int, int] = {}
    for probability, (from_run, to_run) in sorted(
        zip(same_situation_across_runs, links_between_runs), key=lambda link: link[0], reverse=True
    ):
        if probability <= SAME_SITUATION_PROBABILITY:
            break
        if from_run in run_after or to_run in run_before:
            continue
        last_run_of_chain = to_run
        while last_run_of_chain in run_after:
            last_run_of_chain = run_after[last_run_of_chain]
        if last_run_of_chain == from_run:
            continue
        run_after[from_run] = to_run
        run_before[to_run] = from_run

    plots: list[StoryPlot] = []
    for first_run in range(len(runs)):
        if first_run in run_before:
            continue
        key_events: list[str] = []
        run: int | None = first_run
        while run is not None:
            key_events.extend(event.description for event in runs[run])
            run = run_after.get(run)
        plots.append(
            StoryPlot(title="", characters=[], origin="", goal="", key_events=key_events)
        )

    scored_pairs = [
        f"{probability:.2f}  {previous} → {event}"
        for (previous, event), probability in zip(
            pairs_of_next_events + pairs_across_runs,
            same_situation_as_previous + same_situation_across_runs,
        )
    ]
    for scored_pair in scored_pairs:
        _log.info(scored_pair)
    plots.append(
        StoryPlot(
            title="Same situation",
            characters=[],
            origin="",
            goal="",
            key_events=scored_pairs,
        )
    )
    return plots


class StoryScene(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    first_line: int
    last_line: int
    opening_line: str
    story_state: StoryState
    events: list[str]


SAME_SCENE_PROBABILITY = 0.5


def scene_spans(lines_count: int, continuation_probabilities: list[float]) -> list[range]:
    if not lines_count:
        return []
    first_lines_of_new_scenes = [
        line
        for line, probability in enumerate(continuation_probabilities, start=1)
        if probability <= SAME_SCENE_PROBABILITY
    ]
    first_lines = [0, *first_lines_of_new_scenes]
    ends = [*first_lines_of_new_scenes, lines_count]
    return [range(first_line, end) for first_line, end in zip(first_lines, ends)]


class StoryPlotsJob(Job):
    kind = "identify plots"

    def __init__(
        self,
        causal_model: ServedCompletingModel,
        causal_event_trajectory_classifier: ServedCausalEventTrajectoryClassifier,
        story_state_extraction_model: ServedStoryStateExtractionModel,
        document: Document,
    ) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")
        self._causal_model = causal_model
        self._causal_event_trajectory_classifier = causal_event_trajectory_classifier
        self._story_state_extraction_model = story_state_extraction_model
        self._document = document
        self.scenes: list[StoryScene] = []
        self.plots: list[StoryPlot] = []

    async def execute(self) -> None:
        events = await detect_events(self._document, self._causal_model)
        lines = [
            line
            for _, chapter in self._document.chapters
            for line in chapter.splitlines()
            if line
        ]
        probabilities = self._story_state_extraction_model.scene_continuation_probabilities(lines)
        questions_count = max(len(lines) - 1, 0)
        continuation_probabilities = [
            probability
            async for probability in with_progress(
                probabilities, "reading where each scene ends", of=questions_count
            )
        ]
        spans = scene_spans(len(lines), continuation_probabilities)
        for span in with_progress(spans, "describing each scene"):
            story_before_the_scene = "\n\n".join(lines[: span.start])
            scene = "\n\n".join(lines[span.start : span.stop])
            story_state = await self._story_state_extraction_model.story_state(
                story_before_the_scene, scene
            )
            events_in_the_scene = [
                event.description for event in events if event.position_in_manuscript in span
            ]
            story_scene = StoryScene(
                first_line=span.start,
                last_line=span.stop - 1,
                opening_line=lines[span.start],
                story_state=story_state,
                events=events_in_the_scene,
            )
            self.scenes.append(story_scene)
        self.plots = await stitch_events_into_causal_trajectory(
            events,
            "\n\n".join(chapter for _, chapter in self._document.chapters),
            self._causal_event_trajectory_classifier,
        )

