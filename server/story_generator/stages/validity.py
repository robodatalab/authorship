from __future__ import annotations

import logging
import random
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from authordoc.cells.plot_cell import PlotCell, PlotEdge, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from server.progress import with_progress
from server.story_generator.review import EditorShown, Shown
from server.story_generator.stage import Stage, StageStep

# How many times every plot is played from its start, taking each option every
# time.
PLAYS = 100


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


def get_trajectories(plot: PlotCell, exposure: Sequence[PlotNode]) -> list[list[PlotNode]]:
    """Every trajectory along which the play followed the plot, in the order it
    followed them."""
    event_ids = {event.node_id for event in plot.nodes}
    next_event_ids = {edge.from_node_id: edge.to_node_id for edge in plot.edges}
    trajectories: list[list[PlotNode]] = []
    for event in exposure:
        if event.node_id not in event_ids:
            continue
        if trajectories:
            trajectory = trajectories[-1]
            last = trajectory[-1]
            next_event_id = next_event_ids.get(last.node_id)
            if event.node_id == next_event_id:
                trajectory.append(event)
                continue
        trajectories.append([event])
    return trajectories


def get_longest_run(plot: PlotCell, events_seen: list[PlotNode]) -> int:
    """How many events of the plot the play was shown in its longest consistent
    trajectory, as the plot-following score finds trajectories."""
    trajectories = get_trajectories(plot, events_seen)
    lengths = [len(trajectory) for trajectory in trajectories]
    longest = max(lengths, default=0)
    return longest


def get_scenes(document: Document) -> list[list[PlotNode]]:
    events_of_scene: dict[tuple[str, str], list[PlotNode]] = {}
    for plot in document.plots():
        for event in plot.nodes:
            events = events_of_scene.setdefault((event.timestamp, event.place_id), [])
            events.append(event)
    scenes = list(events_of_scene.values())
    return scenes


def get_transitions(document: Document, scene: list[PlotNode]) -> list[PlotEdge]:
    transitions: list[PlotEdge] = []
    for event in scene:
        plot = document.get_plot_of_node(event)
        outbound = plot.outbound_edges(event)
        transitions.extend(outbound)
    return transitions


def play_following(document: Document, plot_index: int) -> tuple[ExposureTracker, BreakingPoint | None]:
    """Plays the story from the first event of the plot at `plot_index`, taking at
    every scene the transition that leads on to the plot's next event. Returns what
    the play was shown, and where it broke, if it did."""
    plots = document.plots()
    plot = plots[plot_index]
    edge_from = {edge.from_node_id: edge for edge in plot.edges}
    tracker = ExposureTracker(document)
    player = StoryPlayer(document, tracker, plot_index)
    event = plot.nodes[0]
    for _ in plot.nodes:
        player.get_transitions()
        edge = edge_from.get(event.node_id)
        if edge is None:
            break
        player.take_transition(edge)
        event = plot.get_node_by_id(edge.to_node_id)
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
    transitions = player.get_transitions()
    while option <= len(transitions) and steps:
        transition = transitions[option - 1]
        player.take_transition(transition)
        transitions = player.get_transitions()
        steps -= 1
    events_seen = tracker.events_seen
    return events_seen


class PlotValidityStep(StageStep):
    """Plays the story to check the plot at `plot_index`, and logs what it found."""

    def __init__(self, plot_index: int) -> None:
        self._plot_index = plot_index

    async def __call__(self, document: Document) -> Document:
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

        scenes = get_scenes(document)
        transitions_of_scenes = [get_transitions(document, scene) for scene in scenes]
        options_offered = [len(transitions) for transitions in transitions_of_scenes]
        most_offered = max(options_offered, default=0)
        options = range(1, most_offered + 1)
        longest_runs_of_option: dict[int, Counter[int]] = {option: Counter() for option in options}
        option_of_each_play = [option for option in options for _ in range(PLAYS)]
        for option in with_progress(option_of_each_play, plot.title):
            events_seen = play_same_option(document, self._plot_index, option)
            longest = get_longest_run(plot, events_seen)
            longest_runs_of_option[option][longest] += 1
        for option, longest_runs in longest_runs_of_option.items():
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

        return document


class SceneCountsStep(StageStep):
    """Counts the story's scenes, those where plots meet and those that offer a
    single choice, and logs them."""

    async def __call__(self, document: Document) -> Document:
        logger = logging.getLogger(__name__)
        scenes = get_scenes(document)
        intersections = 0
        single = 0
        for scene in scenes:
            plots_met = set()
            for event in scene:
                plot = document.get_plot_of_node(event)
                plots_met.add(plot.unique_id)
            if len(plots_met) > 1:
                intersections += 1
            transitions = get_transitions(document, scene)
            if len(transitions) == 1:
                single += 1
        count = len(scenes)
        logger.info("scenes: %d; intersections, where plots meet: %d; scenes with only 1 choice: %d", count, intersections, single)
        return document


class Validity(Stage):

    def run(self, document: Document) -> list[StageStep]:
        plots = document.plots()
        plot_steps: list[StageStep] = [PlotValidityStep(plot_index) for plot_index in range(len(plots))]
        scene_counts_step = SceneCountsStep()
        validity_steps = [*plot_steps, scene_counts_step]
        return validity_steps

    def shown(self) -> Shown:
        return EditorShown()


class ExposureTracker:
    """Chceks what the player was shown"""

    def __init__(self, doc: Document) -> None:
        self._doc = doc
        self.concepts = doc.salient_concepts()
        self.events_seen: list[PlotNode] = []

    def see(self, nodes: Sequence[PlotNode]) -> None:
        self.events_seen.extend(nodes)

    def get_events(self, concept: SalientConceptCell) -> list[PlotNode]:
        """The events that show the concept: those of every plot that references it."""
        events: list[PlotNode] = []
        for plot in self._doc.plots():
            plot_concepts = plot.concepts(self._doc)
            plot_concept_ids = [plot_concept.unique_id for plot_concept in plot_concepts]
            if concept.unique_id in plot_concept_ids:
                events.extend(plot.nodes)
        return events

    def get_seen_events(self, concept: SalientConceptCell) -> list[PlotNode]:
        """The events that show the concept and were seen."""
        seen_ids = {event.node_id for event in self.events_seen}
        events = self.get_events(concept)
        seen = [event for event in events if event.node_id in seen_ids]
        return seen

    def get_exposure(self, concept: SalientConceptCell) -> float:
        """The share of the events that show the concept that were seen; 0 for a
        concept no plot shows."""
        events = self.get_events(concept)
        if not events:
            return 0.0
        seen = self.get_seen_events(concept)
        seen_count = len(seen)
        event_count = len(events)
        exposure = seen_count / event_count
        return exposure


class StoryPlayer:

    def __init__(self, doc: Document, exposure_tracker: ExposureTracker, plot_index: int) -> None:
        self._doc = doc
        self._exposure_tracker = exposure_tracker
        plots = doc.plots()
        followed_plot = plots[plot_index]
        self._current_event = followed_plot.nodes[0]

    def get_transitions(self) -> list[PlotEdge]:
        scene = [
            event
            for plot in self._doc.plots()
            for event in plot.nodes
            if event.timestamp == self._current_event.timestamp and event.place_id == self._current_event.place_id
        ]
        self._exposure_tracker.see(scene)
        transitions = get_transitions(self._doc, scene)
        # Where a continuation stands says nothing of which plot it follows.
        random.shuffle(transitions)
        return transitions

    def take_transition(self, transition: PlotEdge) -> None:
        plot = self._doc.get_plot_of_edge(transition)
        self._current_event = plot.get_node_by_id(transition.to_node_id)
