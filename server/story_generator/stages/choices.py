from __future__ import annotations

import re

from authordoc.cells.plot_cell import PlotEdge, PlotNode
from authordoc.iterators.story_words_iterator import StoryWordsIterator
from authordoc.storydoc import Document
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.review import EditorShown, Shown
from server.story_generator.stage import Stage, StageStep

CHOICES_INSTRUCTIONS = """You write the choices that end one scene of an interactive story. You are the story's narrator and its only witness: you never take part in what happens and never mention yourself.

You are given the scene, and the events that could follow it, numbered, each with where it happens and the scene that tells it. For every event, write one choice: a short line, in the third person and the past tense, that follows from the scene and leads towards the event: it shows whom to follow, what to watch or where to go to see the event, but does not tell what happens. The choices of one scene read alike, and none leans more than the others. Add no characters, places or events beyond those given.

Write one line for every event, in their order, numbered as the events are, and nothing else."""


# The number a choice is written after, as in "2. ".
NUMBERED = re.compile(r"^\s*\d+[.)]\s*")


def _parse_choices_returned_by_llm(written: str) -> list[str]:
    """The choices the model wrote, in order, without their numbers."""
    lines = written.strip().splitlines()
    choices = [NUMBERED.sub("", line).strip() for line in lines if line.strip()]
    return choices


class ChoicesStep(StageStep):
    """The choices one scene ends with: one for each edge leaving its events."""

    def __init__(self, scene_cell_id: str, edges: list[PlotEdge], model: CompletingModel) -> None:
        self._scene_cell_id = scene_cell_id
        self._edges = edges
        self._model = model

    async def __call__(self, document: Document) -> Document:
        scene_cell = document.cell_with_id(self._scene_cell_id)
        story_words = StoryWordsIterator(document)
        could_happen = []
        for number, edge in enumerate(self._edges, start=1):
            plot = document.get_plot_of_edge(edge)
            next_event = plot.get_node_by_id(edge.to_node_id)
            next_scene_text = story_words.text(next_event.story_word_range)
            next_place = next_event.place(document)
            next_place_name = "" if next_place is None else next_place.title
            could_happen.append(f"{number}. {next_place_name}: {next_event.summary}\n{next_scene_text}")
        written_could_happen = "\n\n".join(could_happen)
        request = f"The scene:\n{scene_cell.source}\n\nWhat could happen next:\n{written_could_happen}"
        messages = [{"role": "system", "content": CHOICES_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)

        choices = _parse_choices_returned_by_llm(written)
        numbered_choices = [f"{number}. {choice}" for number, choice in enumerate(choices, start=1)]
        choices_list = "\n".join(numbered_choices)
        scene_with_the_choices = scene_cell.with_source(f"{scene_cell.source}\n\n{choices_list}")
        document_with_the_choices = document.with_cell(scene_with_the_choices)
        return document_with_the_choices


class Choices(Stage):

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel]) -> None:
        self._deployment = deployment

    def run(self, document: Document) -> list[StageStep]:
        model = self._deployment.client_async()
        story_words = StoryWordsIterator(document)
        events_of_scene: dict[tuple[str, str], list[PlotNode]] = {}
        for plot in document.plots():
            for event in plot.nodes:
                events = events_of_scene.setdefault((event.timestamp, event.place_id), [])
                events.append(event)

        choices_steps: list[StageStep] = []
        for events in events_of_scene.values():
            edges: list[PlotEdge] = []
            for event in events:
                plot = document.get_plot_of_node(event)
                outbound = plot.outbound_edges(event)
                edges.extend(outbound)
            # The story ends at a scene no edge leaves: it has no choices.
            if not edges:
                continue
            first_event, *_ = events
            first_span, *_ = story_words.spans(first_event.story_word_range)
            choices_step = ChoicesStep(first_span.cell_id, edges, model)
            choices_steps.append(choices_step)

        return choices_steps

    def shown(self) -> Shown:
        return EditorShown()
