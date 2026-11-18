"""For every concept, the plot that best illustrates it, titled as its concept and
referencing it. The stage lays out every plot as a trajectory of placeholder
events, of the length the mesh needs: four events for every plot the story has.
The model writes how the story that best illustrates the concept starts and
ends, into the trajectory's first and last events; then, level by level and
every plot at every level, the event halfway between two written events.

The causality runs from the concept to the plot: every event is written to
show the plot's concept, so how the concept shows at an event is what the event
says.

The model writes an event as its moment on the world's clock, its place and what
happens, separated by bars, and the author reviews the plots in the Plots tab:

    1 | earth, Varn's house | Varn is given command of a ship bound for Mars.
"""

from __future__ import annotations

from uuid import uuid4

from authordoc.cells.plot_cell import PLOT, PlotCell, PlotEdge, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.review import Shown, CellsShown
from server.story_generator.stage import Stage, StageStep

EVENTS = """Each event is written on one line as: moment | place | what happens.
- The moment is on the world's clock: numbers separated by dots, as in 2.3, where a greater moment is a later one.
- The place runs from the broadest to the most specific, separated by commas, as in "earth, Varn's house".
- What happens is a plain, simple statement of what happens and why."""

ENDS_INSTRUCTIONS = f"""You help an author write an interactive story built from its salient concepts: the ideas a reader should come away understanding.

You are given one concept. Think of the story that would best illustrate it, and write how that story starts and how it ends. Leave room between the two moments for the events that will be written between them.

{EVENTS}

Write two lines, the start and then the end, and nothing else."""

IN_BETWEEN_INSTRUCTIONS = f"""You help an author write an interactive story built from its salient concepts: the ideas a reader should come away understanding.

You are given one concept, and two events of the story that best illustrates it: one before and one after. Write the one event that happens between them: caused by the event before, causing the event after, and showing the concept. Its moment lies between theirs.

{EVENTS}

Write one line and nothing else."""

# The events every plot has, for every plot the story has.
EVENTS_FOR_EVERY_PLOT = 4


def _parse_events_table_returned_by_llm(table: str) -> list[tuple[str, str, str]]:
    """The moment, place and what happens of every event the table lists, in
    order; a line that is not an event is left out."""
    events: list[tuple[str, str, str]] = []
    for line in table.splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        written_moment, place, summary = [part.strip() for part in parts]
        moment = written_moment.lstrip("-* ")
        events.append((moment, place, summary))
    return events


class LayOutPlotsStep(StageStep):
    """The plots laid out for the concepts, put into the story."""

    def __init__(self, plots: list[PlotCell]) -> None:
        self._plots = plots

    async def __call__(self, document: Document) -> Document:
        document_with_plots = document.with_cells([*document.cells, *self._plots])
        return document_with_plots


class PlotEndsStep(StageStep):
    """How the story that best illustrates the concept starts and ends, written
    into the `first` and `last` events of its plot: references to the plot's
    placeholder events."""

    def __init__(self, concept: SalientConceptCell, first: PlotNode, last: PlotNode, model: CompletingModel) -> None:
        self._concept = concept
        self._first = first
        self._last = last
        self._model = model

    async def __call__(self, document: Document) -> Document:
        request = f"{self._concept.title}: {self._concept.source}"
        messages = [{"role": "system", "content": ENDS_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        start, end = _parse_events_table_returned_by_llm(written)
        start_moment, start_place_name, start_summary = start
        end_moment, end_place_name, end_summary = end
        story = InteractiveAuthorStory(document)
        story_with_the_start_place, start_place = story.with_place_named(start_place_name)
        story_with_both_places, end_place = story_with_the_start_place.with_place_named(end_place_name)
        plot = story_with_both_places.document.get_plot_of_node(self._first)
        start_event = PlotNode(
            node_id=self._first.node_id,
            story_word_range=None,
            timestamp=start_moment,
            place_id=start_place.unique_id,
            summary=start_summary,
        )
        end_event = PlotNode(
            node_id=self._last.node_id,
            story_word_range=None,
            timestamp=end_moment,
            place_id=end_place.unique_id,
            summary=end_summary,
        )
        plot_with_the_start = plot.with_node(start_event)
        plot_with_the_ends = plot_with_the_start.with_node(end_event)
        document_with_the_ends = story_with_both_places.document.with_cell(plot_with_the_ends)
        return document_with_the_ends


class InBetweenStep(StageStep):
    """The event of the concept's plot at `at`, written between the events at
    `before` and `after`: references to the plot's placeholder events."""

    def __init__(self, concept: SalientConceptCell, before: PlotNode, at: PlotNode, after: PlotNode, model: CompletingModel) -> None:
        self._concept = concept
        self._before = before
        self._at = at
        self._after = after
        self._model = model

    async def __call__(self, document: Document) -> Document:
        story = InteractiveAuthorStory(document)
        plot = document.get_plot_of_node(self._at)
        event_before = plot.get_node_by_id(self._before.node_id)
        event_after = plot.get_node_by_id(self._after.node_id)
        written_before = story.written_event(event_before)
        written_after = story.written_event(event_after)
        request = (
            f"{self._concept.title}: {self._concept.source}\n\n"
            f"The event before:\n{written_before}\n\n"
            f"The event after:\n{written_after}"
        )
        messages = [{"role": "system", "content": IN_BETWEEN_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        ((moment, place_name, summary),) = _parse_events_table_returned_by_llm(written)
        story_with_the_place, place = story.with_place_named(place_name)
        plot_with_the_place = story_with_the_place.document.get_plot_of_node(self._at)
        event = PlotNode(
            node_id=self._at.node_id,
            story_word_range=None,
            timestamp=moment,
            place_id=place.unique_id,
            summary=summary,
        )
        plot_with_the_event = plot_with_the_place.with_node(event)
        document_with_the_event = story_with_the_place.document.with_cell(plot_with_the_event)
        return document_with_the_event


class Plots(Stage):

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel]) -> None:
        self._deployment = deployment

    def run(self, document: Document) -> list[StageStep]:
        model = self._deployment.client_async()
        concepts = document.salient_concepts()
        plot_length = EVENTS_FOR_EVERY_PLOT * len(concepts)

        # Every concept's plot, laid out as a trajectory of placeholder events,
        # each leading to the next.
        plots = []
        trajectories = []
        for concept in concepts:
            placeholders = [PlotNode(str(uuid4()), None) for _ in range(plot_length)]
            edges = [PlotEdge(str(uuid4()), cause.node_id, effect.node_id) for cause, effect in zip(placeholders, placeholders[1:])]
            plot_laid_out = PlotCell(concept.title, placeholders, edges, "", False, None, str(uuid4()))
            plot = plot_laid_out.with_concepts([concept])
            plots.append(plot)
            trajectories.append((concept, placeholders))
        lay_out_step = LayOutPlotsStep(plots)
        ends_steps = [PlotEndsStep(concept, placeholders[0], placeholders[-1], model) for concept, placeholders in trajectories]
        plot_steps: list[StageStep] = [lay_out_step, *ends_steps]

        # Level by level, the event halfway between every two written events, for
        # every plot, until every event between the ends is written.
        spans = [(0, plot_length - 1)]
        while spans:
            halves = []
            for first, last in spans:
                if last - first < 2:
                    continue
                middle = (first + last) // 2
                for concept, placeholders in trajectories:
                    in_between_step = InBetweenStep(concept, placeholders[first], placeholders[middle], placeholders[last], model)
                    plot_steps.append(in_between_step)
                halves.extend([(first, middle), (middle, last)])
            spans = halves
        return plot_steps

    def shown(self) -> Shown:
        return CellsShown(PLOT)
