from __future__ import annotations

import asyncio
import math
import statistics
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any

from server.jobs import Job
from server.storydoc import Document

# TODO: we'll be performing a lot of operations here on models - it's best if the
# methods here simply exported operations that can be batched and executed together

SIMILARITY_LOGARITHM_BASE = 10
LEAST_PROBABILITY_EVENTS_SHARE_A_PLOT = 0.5


def similarity_of_text(lhs: str, rhs: str) -> float:
    # TODO: implement me
    return 1


def merge_text(lhs: str, rhs: str) -> str:
    # TODO: implement me
    return ""


def best_matches_of_events(
    lhs_events: list[str], rhs_events: list[str]
) -> list[float]:
    similarities = [
        [similarity_of_text(lhs_event, rhs_event) for rhs_event in rhs_events]
        for lhs_event in lhs_events
    ]
    return [max(row, default=0.0) for row in similarities] + [
        max((row[rhs_index] for row in similarities), default=0.0)
        for rhs_index in range(len(rhs_events))
    ]


def similarity_of_matches(matches: list[float]) -> float:
    if not matches:
        return 1.0
    matched = sum(matches) / len(matches)
    return math.log(
        1 + (SIMILARITY_LOGARITHM_BASE - 1) * matched, SIMILARITY_LOGARITHM_BASE
    )


def similarity_of_events(lhs_events: list[str], rhs_events: list[str]) -> float:
    return similarity_of_matches(best_matches_of_events(lhs_events, rhs_events))


def stitch_events_into_plots(
    events: list[str], share_a_plot: list[list[float]]
) -> list[list[str]]:
    plots =[[event_index] for event_index in range(len(events))]
    while len(plots) > 1:
        linkage, lhs_plot_index, rhs_plot_index = max(
            (
                statistics.mean(
                    share_a_plot[lhs_event_index][rhs_event_index]
                    for lhs_event_index in plots[lhs_plot_index]
                    for rhs_event_index in plots[rhs_plot_index]
                ),
                lhs_plot_index,
                rhs_plot_index,
            )
            for lhs_plot_index in range(len(plots))
            for rhs_plot_index in range(lhs_plot_index + 1, len(plots))
        )
        if linkage < LEAST_PROBABILITY_EVENTS_SHARE_A_PLOT:
            break
        plots[lhs_plot_index] = sorted(
            plots[lhs_plot_index] + plots.pop(rhs_plot_index)
        )
    return [[events[event_index] for event_index in plot] for plot in plots]


@dataclass
class StoryPlot:
    origin: str
    goal: str
    events: list[str]

    @classmethod
    def extract(cls, text: str) -> StoryPlot:
        return cls(origin="", goal="", events=[])

    def measure_similarity(self, lhs: StoryPlot) -> float:
        """Returns a similarity between 2 plots where 0 - completely different, 1 - the same.
        The method is symmetric wrt the inputs.
        The similarity has a logarithmic characteristic - the more components are similar, the lower
        the increase in the output similarity, ie. if we have 10 events and only one differs - the
        similarity doens't change that much. But if we have 10 events and only 1 matches - the difference
        is large.
        """
        return similarity_of_matches(
            [
                similarity_of_text(self.origin, lhs.origin),
                similarity_of_text(self.goal, lhs.goal),
                *best_matches_of_events(self.events, lhs.events),
            ]
        )

    def merge(self, lhs: StoryPlot) -> StoryPlot:
        return StoryPlot(
            origin=merge_text(self.origin, lhs.origin),
            goal=merge_text(self.goal, lhs.goal),
            events=[], # TODO: how to measure the events ?  - measure similarity between each and select those that match ?
        )



async def identify_story_plot_pass(
    document: Document, 
    plots: list[StoryPlot],
    similarity_threshold: float = 0.8,
) -> list[StoryPlot]:

    # identify existing plots
    for chapter in document.chapters:
        plot_candidate = StoryPlot.extract(chapter[1])

        plots_similarity = [
            existing_plot.measure_similarity(plot_candidate) for existing_plot in plots]

        for existing_plot_idx, (similarity, existing_plot) in enumerate(zip(plots_similarity, plots)):
            if similarity > similarity_threshold:
                merged_plot = existing_plot.merge(plot_candidate)
                plots[existing_plot_idx] = merged_plot

    # do we need to merge existing plots
    for plot_idx, lhs_plot in enumerate(plots):
        for rhs_plot in plots[plot_idx + 1:]:
            similarity = lhs_plot.measure_similarity(rhs_plot)
            if similarity > similarity_threshold:
                merged_plot = lhs_plot.merge(rhs_plot)
        # TODO: how to do it in a tree fashin - where we compare all plots


    for plot in plots:
        # TODO: do the line attribution
        pass


class StoryPlotsJob(Job):
    kind = "identify plots"

    def __init__(self, document: Document) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#plots")

    async def execute(self) -> None:
        pass

   