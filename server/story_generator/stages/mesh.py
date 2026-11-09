"""The plots brought together on a schedule, so that they meet all the time. Every
plot has as many events as every other, and at every step the round robin pairs
every plot with another, as players are paired in a tournament: one plot stays
put and the others turn round it, a seat a step, and with an odd number of plots
one sits out every step. Every plot's event at a step happens at the step's
moment, and the two events of every pair are rewritten to happen in one place,
where the people of both plots come together: the two plots share a scene. The
author reviews every meeting."""

from __future__ import annotations

from collections.abc import Sequence

from authordoc.cells.plot_cell import PLOT
from authordoc.storydoc import Document, SalientConceptCell
from cortexgrid_infer import CompletingModel
from server.story_generator.review import AnnotationShown, ReviewResult, Review
from server.story_generator.stage import Stage, StageStep

INSTRUCTIONS = """You help an author mesh the plots of an interactive story into one world. The story is built from its salient concepts: every concept has a plot that illustrates it, and every plot respects every concept, so that a character who is a mother acts as a mother in whichever plot she appears.

Every plot has as many events as every other, and the plots meet on a schedule: at every moment, every plot meets another, and the two plots' events at that moment become one scene, where the people of both plots come together.

Every event has a moment on the world's clock and a place, from the broadest to the most specific, as in "earth, Varn's house". Events at the same moment, in places one of which holds the other, are one scene.

You are given the story's concepts, the events of every plot, the two plots to bring together at a moment, with the concepts each illustrates, their events at that moment, and the places the other plots are in at that moment. Rewrite the two events so that:

- both happen in one place, a place the story already has where one fits;
- the place holds none of the places the other plots are in at that moment, and none of those holds it;
- the people of both plots come together there, so that each plot's event takes part in the other's;
- each event still does what it did for its plot: it is caused by its plot's event before it, and causes its plot's event after it;
- none of the people is in two places at one moment.

Each event is a plain, simple statement of what happens and why: no clock times, nothing added for the mechanics of the story.

When you are also given your draft and the author's comments on it, rewrite the draft to answer every comment, and change nothing the comments do not ask you to change.

Write two lines, the first plot's event and then the second's, each as: moment | place | what happens. Write the lines and nothing else."""

# Room for the merged event.
MAX_MEETING_TOKENS = 4096


PlotMatrix = list[list[int]]
ConnectivityTrajectory = list[set[tuple[int, int]]]


def build_round_robin_plot_matrix(n_plots: int, traj_len: int) -> PlotMatrix:
    # The circle method: one seat stays put, the others turn round it a seat a
    # step. An odd count of plots gets an empty seat, and a plot facing it meets
    # nobody.
    n_seats = n_plots + n_plots % 2
    n_rounds = n_seats - 1
    fixed_seat = n_seats - 1
    matrix = []
    for plot_idx in range(n_plots):
        row = []
        for event_idx in range(traj_len):
            round_idx = event_idx % n_rounds
            if plot_idx == fixed_seat:
                partner = round_idx
            elif plot_idx == round_idx:
                partner = fixed_seat
            else:
                partner = (2 * round_idx - plot_idx) % n_rounds
            met = plot_idx if partner >= n_plots else partner
            row.append(met)
        matrix.append(row)
    return matrix


def matrix_to_connectivity_trajectory(matrix: PlotMatrix) -> ConnectivityTrajectory:
    n_rows = len(matrix)
    n_cols = len(matrix[0])

    events_to_merge: ConnectivityTrajectory = []
    for event_idx in range(n_cols):
        merges_at_event = set()
        for lhs_plot_idx in range(n_rows):
            rhs_plot_idx = matrix[lhs_plot_idx][event_idx]
            if lhs_plot_idx != rhs_plot_idx:
                merge: tuple[int, int] = tuple(sorted((lhs_plot_idx, rhs_plot_idx)))
                merges_at_event.add(merge)
        events_to_merge.append(merges_at_event)

    return events_to_merge


class MeshStep(StageStep):
    """One meeting: the events of two plots at one step, merged into one."""

    def __init__(self, first_plot_idx: int, second_plot_idx: int, step_index: int, model: CompletingModel) -> None:
        self._first_plot_idx = first_plot_idx
        self._second_plot_idx = second_plot_idx
        self._step_index = step_index
        self._model = model

    async def __call__(self, document: Document, reviews: Review, reviewer_instruction: str) -> tuple[ReviewResult, Document]:
        plots = document.plots()
        first_plot = plots[self._first_plot_idx]
        second_plot = plots[self._second_plot_idx]

        first_event = first_plot.nodes[self._step_index]
        second_event = second_plot.nodes[self._step_index]

        first_concepts = first_plot.concepts(document)
        second_concepts = second_plot.concepts(document)
        first_written = _concepts_str(first_concepts)
        second_written = _concepts_str(second_concepts)
        # The model takes no empty message: the request is said even when the
        # author has nothing to add.
        asked = f"\n\nThe author asks you to do it again: {reviewer_instruction}" if reviewer_instruction else ""
        user = f"Merge the two events.{asked}"
        system = f"""
Two story plot events meet, and we need to unify them.
Event 1, at {first_event.location}:
{first_event.summary}

Event 2, at {second_event.location}:
{second_event.summary}

The events are a part of two plots that attempt to detail salient concepts:
Concept 1:
{first_written}
Concept 2:
{second_written}

Merge the events so that they stay close to their original, but represent a single event
that provides the same information about the concepts as the original events did.

Write one line: the place where the merged event happens, from the broadest to the most
specific, as in "earth, Varn's house", then " | ", then what happens. Write the line and
nothing else.
"""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        streamed = self._model.complete(messages, max_new_tokens=MAX_MEETING_TOKENS)
        chunks = [chunk.content async for chunk in streamed]
        merged_event_str = "".join(chunks)

        merged_event_desc, merged_event_location = _parse_event_str(merged_event_str)

        first_meshed = first_event.with_summary(merged_event_desc)
        first_meshed = first_meshed.with_location(merged_event_location)
        second_meshed = second_event.with_summary(merged_event_desc)
        second_meshed = second_meshed.with_location(merged_event_location)
        # Both events happen at the step's moment: the mesh's schedule is the world's clock.
        moment = str(self._step_index + 1)
        first_meshed = first_meshed.with_timestamp(moment)
        second_meshed = second_meshed.with_timestamp(moment)

        first_plot_meshed = first_plot.with_node(first_meshed)
        second_plot_meshed = second_plot.with_node(second_meshed)
        meshed = document.with_cell(first_plot_meshed)
        meshed = meshed.with_cell(second_plot_meshed)

        shown = AnnotationShown(PLOT, first_plot.unique_id, first_event.node_id)
        review_result = await reviews(meshed, shown)
        if not review_result.is_passed():
            return review_result, document
        return review_result, meshed


class Mesh(Stage):

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    def run(self, document: Document) -> list[StageStep]:
        plots_at_the_start = document.plots()
        if not plots_at_the_start:
            return []
        n_plots = len(plots_at_the_start)
        lengths = [len(plot.nodes) for plot in plots_at_the_start]
        steps = max(lengths)
        matrix = build_round_robin_plot_matrix(n_plots, steps)
        trajectory = matrix_to_connectivity_trajectory(matrix)

        mesh_steps: list[StageStep] = []
        for step_index, changes_at_step in enumerate(trajectory):
            for first_plot_idx, second_plot_idx in changes_at_step:
                mesh_step = MeshStep(first_plot_idx, second_plot_idx, step_index, self._model)
                mesh_steps.append(mesh_step)

        return mesh_steps


def _concepts_str(concepts: Sequence[SalientConceptCell]) -> str:
    """The concepts, each under its title, with its description."""
    described = [f"### {concept.title}\n{concept.source}" for concept in concepts]
    written = "\n\n".join(described) or "None yet."
    return written


def _parse_event_str(event_str: str) -> tuple[str, str]:
    """The merged event's description and location, from the model's answer: the
    location, a bar, then the description, as in "earth, the square | Varn meets
    the lawyer."."""
    written_location, _, written_desc = event_str.partition("|")
    location = written_location.strip()
    desc = written_desc.strip()
    return desc, location
