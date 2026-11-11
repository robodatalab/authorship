"""A scene for every event, and the events of other plots that intersect it: the
same event, at the same moment and in the same place. The model writes the scene
from the event, and every one of the events points at the whole of the markdown
cell that tells it. Nothing else of the events or the concepts changes: a scene
shows the concepts of the plots its events belong to. The author reviews the
scenes in the editor."""

from __future__ import annotations

from uuid import uuid4

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.plot_cell import PlotNode
from authordoc.iterators.story_words_iterator import StoryWordsIterator
from authordoc.storydoc import Document
from cortexgrid_infer import CompletingModel
from server.story_generator.review import EditorShown, Shown
from server.story_generator.stage import Stage, StageStep

SCENE_INSTRUCTIONS = """You write one scene of an interactive story, the way a text adventure such as Zork shows a location: whoever reads it may have come to it from anywhere in the story, so it stands on its own. It says nothing of what happened before it, and nothing of what may happen after it. You are the story's narrator and its only witness: you never take part in what happens and never mention yourself. Write in the third person and the past tense.

You are given where the scene takes place and what happens there. Tell it.

Write two to five paragraphs of prose and nothing else."""

# Room for a scene of a few paragraphs.
MAX_SCENE_TOKENS = 3000


class SceneStep(StageStep):
    """The scene that tells the events, written from the first of them into a
    markdown cell that every one of them points at."""

    def __init__(self, events: list[PlotNode], model: CompletingModel) -> None:
        self._events = events
        self._model = model

    async def __call__(self, document: Document) -> Document:
        event, *_ = self._events
        request = f"Where: {event.location}\n\nWhat happens:\n{event.summary}"
        messages = [{"role": "system", "content": SCENE_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages, max_new_tokens=MAX_SCENE_TOKENS)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        scene = written.strip()

        cell = MarkdownCell(scene, False, None, str(uuid4()))
        told = document.with_cells([*document.cells, cell])
        story_words = StoryWordsIterator(told)
        scene_words = story_words.range_between(cell.unique_id, 0, len(scene))
        for event in self._events:
            plot = told.get_plot_of_node(event)
            event_told = event.with_story_word_range(scene_words)
            plot_told = plot.with_node(event_told)
            told = told.with_cell(plot_told)
        return told


class Scenes(Stage):

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    def run(self, document: Document) -> list[StageStep]:
        # Events at the same moment and in the same place are one scene.
        events_of_scene: dict[tuple[str, str], list[PlotNode]] = {}
        for plot in document.plots():
            for event in plot.nodes:
                events = events_of_scene.setdefault((event.timestamp, event.location), [])
                events.append(event)
        scene_steps: list[StageStep] = [SceneStep(events, self._model) for events in events_of_scene.values()]
        return scene_steps

    def shown(self) -> Shown:
        return EditorShown()
