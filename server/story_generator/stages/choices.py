"""The choices every scene the story goes on from ends with: for every edge leaving
the scene's events, a choice that follows from the scene's narrative and leads
towards the event the edge reaches, without telling it. The model writes a
scene's choices together, so that they read as one, and the author reviews them
in the editor:

    1. Varn followed the water to her room.
    2. Dax raised his cup to the crowd.
"""

from __future__ import annotations

import re

from authordoc.cells.plot_cell import PlotEdge
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory, InteractiveScene
from cortexgrid_infer import CompletingModel
from server.story_generator.review import EditorShown, Shown
from server.story_generator.stage import Stage, StageStep

CHOICES_INSTRUCTIONS = """You write the choices that end one scene of an interactive story. You are the story's narrator and its only witness: you never take part in what happens and never mention yourself.

You are given the scene, and the events that could follow it, numbered, each with where it happens and the scene that tells it. For every event, write one choice: a short line, in the third person and the past tense, that follows from the scene and leads towards the event: it shows whom to follow, what to watch or where to go to see the event, but does not tell what happens. The choices of one scene read alike, and none leans more than the others. Add no characters, places or events beyond those given.

Write one line for every event, in their order, numbered as the events are, and nothing else."""

# Room for the choices of one scene.
MAX_CHOICES_TOKENS = 500

# The number a choice is written after, as in "2. ".
NUMBERED = re.compile(r"^\s*\d+[.)]\s*")


def _parse_choices_returned_by_llm(written: str) -> list[str]:
    """The choices the model wrote, in order, without their numbers."""
    lines = written.strip().splitlines()
    choices = [NUMBERED.sub("", line).strip() for line in lines if line.strip()]
    return choices


class ChoicesStep(StageStep):
    """The choices one scene ends with: one for each edge leaving its events."""

    def __init__(self, scene: InteractiveScene, edges: list[PlotEdge], model: CompletingModel) -> None:
        self._scene = scene
        self._edges = edges
        self._model = model

    async def __call__(self, document: Document) -> Document:
        story = InteractiveAuthorStory(document)
        could_happen = []
        for number, edge in enumerate(self._edges, start=1):
            plot = document.get_plot_of_edge(edge)
            next_event = plot.get_node_by_id(edge.to_node_id)
            next_scene = story.scene_of(next_event)
            could_happen.append(f"{number}. {next_event.location}: {next_event.summary}\n{next_scene.text}")
        written_could_happen = "\n\n".join(could_happen)
        request = f"The scene:\n{self._scene.text}\n\nWhat could happen next:\n{written_could_happen}"
        messages = [{"role": "system", "content": CHOICES_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages, max_new_tokens=MAX_CHOICES_TOKENS)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)

        choices = _parse_choices_returned_by_llm(written)
        options = {edge.edge_id: choice for edge, choice in zip(self._edges, choices, strict=True)}
        scene = self._scene.with_options(options)
        story_with_the_choices = story.with_scenes([scene])
        return story_with_the_choices.document


class Choices(Stage):

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    def run(self, document: Document) -> list[StageStep]:
        story = InteractiveAuthorStory(document)

        choices_steps: list[StageStep] = []
        for scene in story.scenes:
            events = story.events_of(scene)
            edges: list[PlotEdge] = []
            for event in events:
                plot = document.get_plot_of_node(event)
                outbound = plot.outbound_edges(event)
                edges.extend(outbound)
            # The story ends at a scene no edge leaves: it has no choices.
            if not edges:
                continue
            choices_step = ChoicesStep(scene, edges, self._model)
            choices_steps.append(choices_step)

        return choices_steps

    def shown(self) -> Shown:
        return EditorShown()
