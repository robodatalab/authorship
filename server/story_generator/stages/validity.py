"""Whether the story does what the benchmark needs of it, found by playing it
with the benchmark's own player, with no model: scripted plays, and what they
are shown, as the benchmark's exposure tracker records it. The stage only
reports, in the log: it changes nothing in the story, and asks the author
nothing. A step plays one plot; the last counts the story's scenes.

1. Following every plot from start to finish. A play starts at the plot's first
   event, and at every scene takes the choice that leads on to the plot's next
   event. The plot breaks where the play cannot go on: where the player fails to
   show the scene, or the scene offers no choice leading on, or two of its
   choices read the same; or where the play ends without having been shown the
   whole plot, each event right after the one before it.
2. Seeing every concept. The same play must be shown every event that shows
   a concept the plot references: every event of every plot that references
   the concept. Every such event it is not shown is reported, by what happens
   there.
3. Taking the same option every time. From the first event of every plot, the
   story is played over and over taking option 1 every time, then option 2, and
   so on, ending, as the benchmark's agent player does, at a scene that offers
   fewer options. The player shuffles a scene's choices every time it shows them,
   so the plays differ. Each play's longest consistent trajectory of the plot,
   its events each right after the one before it, is measured as the
   plot-following score measures trajectories: how many plays reach the plot's
   end, and how many have a longest trajectory of each length.
4. Where plots meet. The scenes where plots intersect, against the scenes that
   offer a single choice.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass

from authordoc.cells.plot_cell import PlotCell, PlotNode
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.plot_following import get_trajectories
from server.story_generator.exposure_tracker import ExposureTracker
from server.story_generator.story_player import StoryPlayer
from server.story_generator.review import ReviewResult, Review
from server.story_generator.stage import Stage, StageStep

# How many times every plot is played from its start, taking each option every
# time.
PLAYS = 100

# What the benchmark's player raises when it cannot show a scene: a choice
# missing for an edge, an event told by no scene.
PLAYER_FAILURES = (KeyError, AttributeError)


@dataclass(frozen=True)
class BreakingPoint:
    """Where a play following a plot to the letter cannot go on."""

    # What happens at the event the play broke at.
    event: str
    reason: str


@dataclass(frozen=True)
class UnseenEvents:
    """The events showing a concept that a play following a plot of the concept
    is not shown."""

    concept: str
    # How many events show the concept.
    total: int
    # What happens at every event not shown.
    summaries: list[str]


def get_longest_run(plot: PlotCell, events_seen: list[PlotNode]) -> int:
    """How many events of the plot the play was shown in its longest consistent
    trajectory, as the plot-following score finds trajectories."""
    trajectories = get_trajectories(plot, events_seen)
    lengths = [len(trajectory) for trajectory in trajectories]
    longest = max(lengths, default=0)
    return longest


def play_following(document: Document, plot_index: int) -> tuple[ExposureTracker, BreakingPoint | None]:
    """Plays the story from the first event of the plot at `plot_index`, taking at
    every scene the choice that leads on to the plot's next event. Returns what
    the play was shown, and where it broke, if it did."""
    plots = document.plots()
    plot = plots[plot_index]
    story = InteractiveAuthorStory(document)
    edge_from = {edge.from_node_id: edge for edge in plot.edges}
    tracker = ExposureTracker(document)
    player = StoryPlayer(document, tracker, plot_index)
    event = plot.nodes[0]
    for _ in plot.nodes:
        try:
            _, continuations = player.get_current_scene()
        except PLAYER_FAILURES as failure:
            failure_type = type(failure)
            kind = failure_type.__name__
            failed = BreakingPoint(event.summary, f"the player fails to show its scene ({kind}: {failure})")
            return (tracker, failed)
        edge = edge_from.get(event.node_id)
        if edge is None:
            break
        next_event = plot.get_node_by_id(edge.to_node_id)
        scene = story.scene_of(event)
        choice = scene.options.get(edge.edge_id)
        if choice is None or choice not in continuations:
            not_offered = BreakingPoint(event.summary, f'its scene offers no choice leading on to "{next_event.summary}"')
            return (tracker, not_offered)
        readings = continuations.count(choice)
        if readings > 1:
            alike = BreakingPoint(event.summary, f'{readings} of its choices read the same as the one leading on: "{choice}"')
            return (tracker, alike)
        action = continuations.index(choice)
        player.step(action)
        event = next_event
    longest = get_longest_run(plot, tracker.events_seen)
    length = len(plot.nodes)
    if longest < length:
        short = BreakingPoint(event.summary, f"the play ends here, shown {longest} of the plot's {length} events in a row")
        return (tracker, short)
    return (tracker, None)


def get_unseen_events(document: Document, plot: PlotCell, tracker: ExposureTracker) -> list[UnseenEvents]:
    """For every concept the plot references, the events showing it that the play
    was not shown; a concept whose events were all shown is left out."""
    unseen_events = []
    for concept in plot.concepts(document):
        events = tracker.get_events(concept)
        seen = tracker.get_seen_events(concept)
        seen_ids = {event.node_id for event in seen}
        summaries = [event.summary for event in events if event.node_id not in seen_ids]
        if summaries:
            total = len(events)
            unseen = UnseenEvents(concept.title, total, summaries)
            unseen_events.append(unseen)
    return unseen_events


def play_same_option(document: Document, plot_index: int, option: int) -> list[PlotNode]:
    """Plays the story from the first event of the plot at `plot_index`, taking the
    option every time, until a scene offers fewer options or the story ends.
    Returns every event the play was shown, in the order it was shown them."""
    plots = document.plots()
    tracker = ExposureTracker(document)
    player = StoryPlayer(document, tracker, plot_index)
    # A play that goes round for ever is ended once it has taken as many steps as
    # the story has events.
    event_counts = [len(each.nodes) for each in plots]
    steps = sum(event_counts)
    try:
        _, continuations = player.get_current_scene()
        while option <= len(continuations) and steps:
            player.step(option - 1)
            _, continuations = player.get_current_scene()
            steps -= 1
    except PLAYER_FAILURES:
        # The player cannot show the scene: the play ends there.
        pass
    events_seen = tracker.events_seen
    return events_seen


class PlotValidityStep(StageStep):
    """Plays the story to check the plot at `plot_index`, and logs what it found."""

    def __init__(self, plot_index: int) -> None:
        self._plot_index = plot_index

    async def __call__(self, document: Document, reviews: Review, reviewer_instruction: str) -> tuple[ReviewResult, Document]:
        logger = logging.getLogger(__name__)
        plots = document.plots()
        plot = plots[self._plot_index]
        length = len(plot.nodes)

        tracker, breaking_point = play_following(document, self._plot_index)
        if breaking_point is None:
            logger.info("%s, %d events: can be followed from start to finish", plot.title, length)
        else:
            logger.info('%s, %d events: breaks at "%s": %s', plot.title, length, breaking_point.event, breaking_point.reason)

        unseen_events = get_unseen_events(document, plot, tracker)
        for unseen in unseen_events:
            count = len(unseen.summaries)
            logger.info("  %s: %d of its %d events not shown", unseen.concept, count, unseen.total)
            for summary in unseen.summaries:
                logger.info('    "%s"', summary)

        story = InteractiveAuthorStory(document)
        options_offered = [len(scene.options) for scene in story.scenes]
        most_offered = max(options_offered, default=0)
        for option in range(1, most_offered + 1):
            longest_runs: Counter[int] = Counter()
            for _ in range(PLAYS):
                events_seen = play_same_option(document, self._plot_index, option)
                longest = get_longest_run(plot, events_seen)
                longest_runs[longest] += 1
            end_achieved = longest_runs[length] / PLAYS
            by_length = sorted(longest_runs.items())
            runs = [f"{run} {'event' if run == 1 else 'events'} {plays / PLAYS:.0%}" for run, plays in by_length]
            written_runs = ", ".join(runs)
            logger.info(
                "  always option %d - plot end achieved %.0f%%, longest consistent plot trajectory: %s",
                option,
                end_achieved * 100,
                written_runs,
            )

        review_result = ReviewResult.success()
        return review_result, document


class SceneCountsStep(StageStep):
    """Counts the story's scenes, those where plots meet and those that offer a
    single choice, and logs them."""

    async def __call__(self, document: Document, reviews: Review, reviewer_instruction: str) -> tuple[ReviewResult, Document]:
        logger = logging.getLogger(__name__)
        story = InteractiveAuthorStory(document)
        scenes = story.scenes
        intersections = 0
        single = 0
        for scene in scenes:
            plots_met = set()
            for event in story.events_of(scene):
                plot = document.get_plot_of_node(event)
                plots_met.add(plot.unique_id)
            if len(plots_met) > 1:
                intersections += 1
            if len(scene.options) == 1:
                single += 1
        count = len(scenes)
        logger.info("scenes: %d; intersections, where plots meet: %d; scenes with only 1 choice: %d", count, intersections, single)
        review_result = ReviewResult.success()
        return review_result, document


class Validity(Stage):

    def run(self, document: Document) -> list[StageStep]:
        plots = document.plots()
        plot_steps: list[StageStep] = [PlotValidityStep(plot_index) for plot_index in range(len(plots))]
        scene_counts_step = SceneCountsStep()
        validity_steps = [*plot_steps, scene_counts_step]
        return validity_steps
