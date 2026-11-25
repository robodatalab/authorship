from __future__ import annotations

from authordoc.cells.place_cell import PlaceCell
from authordoc.cells.plot_cell import PLOT
from authordoc.storydoc import Document
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.review import Shown, CellsShown
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

Write two lines, the first plot's event and then the second's, each as: moment | place | what happens. Write the lines and nothing else."""


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

    async def __call__(self, document: Document) -> Document:
        plots = document.plots()
        first_plot = plots[self._first_plot_idx]
        second_plot = plots[self._second_plot_idx]

        first_event = first_plot.nodes[self._step_index]
        second_event = second_plot.nodes[self._step_index]

        first_place = first_event.place(document)
        second_place = second_event.place(document)
        first_place_name = "" if first_place is None else first_place.title
        second_place_name = "" if second_place is None else second_place.title
        first_characters = first_event.characters(document)
        second_characters = second_event.characters(document)
        first_who = ", ".join(character.title for character in first_characters) or "no one named"
        second_who = ", ".join(character.title for character in second_characters) or "no one named"
        first_concepts = first_plot.concepts(document)
        second_concepts = second_plot.concepts(document)
        first_concepts_under_their_titles = [f"### {concept.title}\n{concept.source}" for concept in first_concepts]
        second_concepts_under_their_titles = [f"### {concept.title}\n{concept.source}" for concept in second_concepts]
        first_written = "\n\n".join(first_concepts_under_their_titles) or "None yet."
        second_written = "\n\n".join(second_concepts_under_their_titles) or "None yet."
        user = "Merge the two events."
        system = f"""
Two story plot events meet, and we need to unify them.
Event 1, at {first_place_name}, with {first_who}:
{first_event.summary}

Event 2, at {second_place_name}, with {second_who}:
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
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        merged_event_str = "".join(chunks)

        merged_event_desc, merged_event_place_name = _parse_event_str(merged_event_str)
        places = [cell for cell in document.cells if isinstance(cell, PlaceCell)]
        merged_place = next((place for place in places if place.title.casefold() == merged_event_place_name.casefold()), None)
        document_with_the_merged_place = document
        if merged_place is None:
            merged_place = PlaceCell(merged_event_place_name)
            document_with_the_merged_place = document.with_cells([*document.cells, merged_place])

        first_character_ids = [character.unique_id for character in first_characters]
        only_in_the_second = [character for character in second_characters if character.unique_id not in first_character_ids]
        merged_characters = [*first_characters, *only_in_the_second]

        first_meshed = first_event.with_summary(merged_event_desc)
        first_meshed = first_meshed.with_place(merged_place)
        first_meshed = first_meshed.with_characters(merged_characters)
        second_meshed = second_event.with_summary(merged_event_desc)
        second_meshed = second_meshed.with_place(merged_place)
        second_meshed = second_meshed.with_characters(merged_characters)
        # Both events happen at the step's moment: the mesh's schedule is the world's clock.
        moment = str(self._step_index + 1)
        first_meshed = first_meshed.with_timestamp(moment)
        second_meshed = second_meshed.with_timestamp(moment)

        first_plot_meshed = first_plot.with_node(first_meshed)
        second_plot_meshed = second_plot.with_node(second_meshed)
        meshed = document_with_the_merged_place.with_cell(first_plot_meshed)
        meshed = meshed.with_cell(second_plot_meshed)
        return meshed


class Mesh(Stage):

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel]) -> None:
        self._deployment = deployment

    def run(self, document: Document) -> list[StageStep]:
        model = self._deployment.client_async()
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
                mesh_step = MeshStep(first_plot_idx, second_plot_idx, step_index, model)
                mesh_steps.append(mesh_step)

        return mesh_steps

    def shown(self) -> Shown:
        return CellsShown(PLOT)


def _parse_event_str(event_str: str) -> tuple[str, str]:
    """The merged event's description and the name of its place, from the model's
    answer: the place, a bar, then the description, as in "earth, the square | Varn
    meets the lawyer."."""
    written_place_name, _, written_desc = event_str.partition("|")
    place_name = written_place_name.strip()
    desc = written_desc.strip()
    return desc, place_name
