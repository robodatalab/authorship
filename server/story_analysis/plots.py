from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from cortexgrid_infer import CompletionChunk, ServedCompletingModel
from server.jobs import Job
from server.progress import with_progress
from server.story_analysis.causal_event_trajectory_classifier import (
    ServedCausalEventTrajectoryClassifier,
)
from server.storydoc import Document
from server.utils import estimate_num_tokens_in_text

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


Plot = list[str]

async def stitch_events_into_causal_trajectory(
    events: list[StoryEvent],
    story: str,
    causal_event_trajectory_classifier: ServedCausalEventTrajectoryClassifier,
) -> list[Plot]:
    """Takes a list of events and groups them into plots."""
    effects_on_next_event = [
        causal_effect
        async for causal_effect in with_progress(
            causal_event_trajectory_classifier.causal_effects(
                story,
                [(cause.description, effect.description) for cause, effect in zip(events, events[1:])],
            ),
            "measuring how each event leads to the next",
            of=max(len(events) - 1, 0),
        )
    ]
    runs = [[event] for event in events[:1]]
    for next_event, causal_effect in zip(events[1:], effects_on_next_event):
        if causal_effect > 0:
            runs[-1].append(next_event)
        else:
            runs.append([next_event])

    links_between_runs = [
        (from_run, to_run)
        for from_run in range(len(runs))
        for to_run in range(len(runs))
        if from_run != to_run
    ]
    effects_between_runs = [
        causal_effect
        async for causal_effect in with_progress(
            causal_event_trajectory_classifier.causal_effects(
                story,
                [(runs[from_run][-1].description, runs[to_run][0].description) for from_run, to_run in links_between_runs],
            ),
            "measuring how each run of events leads to the others",
            of=len(links_between_runs),
        )
    ]
    run_after: dict[int, int] = {}
    run_before: dict[int, int] = {}
    for causal_effect, (from_run, to_run) in sorted(
        zip(effects_between_runs, links_between_runs), key=lambda link: link[0], reverse=True
    ):
        if causal_effect <= 0:
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

    plots: list[Plot] = []
    for first_run in range(len(runs)):
        if first_run in run_before:
            continue
        plot: Plot = []
        run: int | None = first_run
        while run is not None:
            plot.extend(event.description for event in runs[run])
            run = run_after.get(run)
        plots.append(plot)
    return plots


class StoryPlotsJob(Job):
    kind = "identify plots"

    def __init__(self, causal_model: ServedCompletingModel, document: Document) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")
        self._causal_model = causal_model
        self._document = document
        self.plots: list[Plot] = []

    async def execute(self) -> None:
        self.plots = await detect_events(self._document, self._causal_model)

