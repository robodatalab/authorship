from __future__ import annotations

import re
from uuid import uuid4

from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.place_cell import PlaceCell
from authordoc.cells.plot_cell import PlotCell, PlotEdge, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.stage import Stage, StageStep

EVENTS = """Each event is written on one line as: moment | place | characters | what happens.
- The moment is on the world's clock: numbers separated by dots, as in 2.3, where a greater moment is a later one.
- The place runs from the broadest to the most specific, separated by commas, as in "earth, Varn's house".
- The characters are everyone who takes part, separated by commas: a main character by the name given, anyone else by a name of their own.
- What happens is a plain, simple statement of what happens and why."""

ENDS_INSTRUCTIONS = f"""You help an author write an interactive story built from its salient concepts: the ideas a reader should come away understanding.

You are given one concept and the main characters its story follows. Think of the story that would best illustrate it, and write how that story starts and how it ends. Leave room between the two moments for the events that will be written between them.

{EVENTS}

Write two lines, the start and then the end, and nothing else."""

IN_BETWEEN_INSTRUCTIONS = f"""You help an author write an interactive story built from its salient concepts: the ideas a reader should come away understanding.

You are given one concept, the main characters its story follows, and two events of that story: one before and one after. Write the one event that happens between them: caused by the event before, causing the event after, and showing the concept. Its moment lies between theirs.

{EVENTS}

Write one line and nothing else."""

# The events every plot has, for every plot the story has.
EVENTS_FOR_EVERY_PLOT = 4


def _parse_events_table_returned_by_llm(table: str) -> list[tuple[str, str, list[str], str]]:
    """The moment, place, characters and what happens of every event the table
    lists, in order; a line that is not an event is left out."""
    events: list[tuple[str, str, list[str], str]] = []
    for line in table.splitlines():
        parts = line.split("|", 3)
        if len(parts) != 4:
            continue
        written_moment, place, written_names, summary = [part.strip() for part in parts]
        moment = written_moment.lstrip("-* ")
        names_written = [name.strip() for name in written_names.split(",")]
        names = [name for name in names_written if name]
        events.append((moment, place, names, summary))
    return events


def _write_under_their_titles(characters: list[CharacterCell]) -> str:
    characters_under_their_titles = [f"### {character.title}\n{character.source}" for character in characters]
    written = "\n\n".join(characters_under_their_titles) or "None yet."
    return written


def _write_event(document: Document, event: PlotNode) -> str:
    place = event.place(document)
    place_name = "" if place is None else place.title
    characters = event.characters(document)
    names = ", ".join(character.title for character in characters)
    line = " | ".join((event.timestamp, place_name, names, event.summary))
    return line


def _is_named_in(what_happens: str, name: str) -> bool:
    words_of_what_happens = set(re.findall(r"\w+", what_happens))
    words_of_the_name = re.findall(r"\w+", name)
    named = any(word in words_of_what_happens for word in words_of_the_name)
    return named


async def _with_the_event_told(
    document: Document,
    plot: PlotCell,
    concept: SalientConceptCell,
    node_id: str,
    event_written: tuple[str, str, list[str], str],
    model: CompletingModel,
) -> tuple[Document, PlotCell]:
    moment, place_name, names, summary = event_written
    names_in_what_happens = [name for name in names if _is_named_in(summary, name)]
    places = [cell for cell in document.cells if isinstance(cell, PlaceCell)]
    place = next((place for place in places if place.title.casefold() == place_name.casefold()), None)
    document_with_the_place = document
    if place is None:
        place = PlaceCell(place_name)
        document_with_the_place = document.with_cells([*document.cells, place])
    document_with_the_characters, characters = await with_the_characters_named(
        document_with_the_place, names_in_what_happens, f"The event:\n{summary}", model
    )
    character_ids = [character.unique_id for character in characters]
    event = PlotNode(
        node_id=node_id,
        story_word_range=None,
        timestamp=moment,
        place_id=place.unique_id,
        character_ids=character_ids,
        summary=summary,
    )
    generated = [character for character in characters if document_with_the_place.cell_with_id(character.unique_id) is None]
    tied = [character.with_concepts([concept]) for character in generated]
    document_with_them_tied = document_with_the_characters
    for character in tied:
        document_with_them_tied = document_with_them_tied.with_cell(character)
    main_characters = plot.characters(document_with_them_tied)
    plot_following_them = plot.with_characters([*main_characters, *tied])
    plot_with_the_event = plot_following_them.with_node(event)
    return document_with_them_tied, plot_with_the_event


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
        plot = document.get_plot_of_node(self._first)
        main_characters = plot.characters(document)
        main_characters_written = _write_under_their_titles(main_characters)
        request = f"{self._concept.title}: {self._concept.source}\n\nThe main characters:\n{main_characters_written}"
        messages = [{"role": "system", "content": ENDS_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        start, end = _parse_events_table_returned_by_llm(written)
        document_with_the_start, plot_with_the_start = await _with_the_event_told(
            document, plot, self._concept, self._first.node_id, start, self._model
        )
        document_with_both_ends, plot_with_the_ends = await _with_the_event_told(
            document_with_the_start, plot_with_the_start, self._concept, self._last.node_id, end, self._model
        )
        document_with_the_ends = document_with_both_ends.with_cell(plot_with_the_ends)
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
        plot = document.get_plot_of_node(self._at)
        event_before = plot.get_node_by_id(self._before.node_id)
        event_after = plot.get_node_by_id(self._after.node_id)
        written_before = _write_event(document, event_before)
        written_after = _write_event(document, event_after)
        main_characters = plot.characters(document)
        main_characters_written = _write_under_their_titles(main_characters)
        request = (
            f"{self._concept.title}: {self._concept.source}\n\n"
            f"The main characters:\n{main_characters_written}\n\n"
            f"The event before:\n{written_before}\n\n"
            f"The event after:\n{written_after}"
        )
        messages = [{"role": "system", "content": IN_BETWEEN_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        (event_written,) = _parse_events_table_returned_by_llm(written)
        document_with_the_event, plot_with_the_event = await _with_the_event_told(
            document, plot, self._concept, self._at.node_id, event_written, self._model
        )
        document_with_the_event = document_with_the_event.with_cell(plot_with_the_event)
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
        characters = [cell for cell in document.cells if isinstance(cell, CharacterCell)]
        for concept in concepts:
            placeholders = [PlotNode(str(uuid4()), None) for _ in range(plot_length)]
            edges = [PlotEdge(str(uuid4()), cause.node_id, effect.node_id) for cause, effect in zip(placeholders, placeholders[1:])]
            plot_laid_out = PlotCell(concept.title, placeholders, edges, "", False, None, str(uuid4()))
            plot_of_the_concept = plot_laid_out.with_concepts([concept])
            main_characters = [character for character in characters if concept in character.concepts(document)]
            plot = plot_of_the_concept.with_characters(main_characters)
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




SECONDARY_CHARACTER_INSTRUCTIONS = """You help an author write an interactive story. A character the story has no backstory for takes part in the part of it you are given.

Write the character's backstory in one or two sentences: who they are, and why they take part. Write the sentences and nothing else."""


async def with_the_characters_named(
    document: Document, names: list[str], taking_part_in: str, model: CompletingModel
) -> tuple[Document, list[CharacterCell]]:
    characters: list[CharacterCell] = []
    for name in names:
        characters_in_the_story = [cell for cell in document.cells if isinstance(cell, CharacterCell)]
        named = next((character for character in characters_in_the_story if character.title == name), None)
        if named is None:
            request = f"The character: {name}\n\n{taking_part_in}"
            messages = [{"role": "system", "content": SECONDARY_CHARACTER_INSTRUCTIONS}, {"role": "user", "content": request}]
            streamed = model.complete(messages)
            chunks = [chunk.content async for chunk in streamed]
            written = "".join(chunks)
            backstory = written.strip()
            named = CharacterCell(name, backstory)
            document = document.with_cells([*document.cells, named])
        characters.append(named)
    return document, characters
