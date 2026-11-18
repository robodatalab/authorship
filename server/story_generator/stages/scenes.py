"""A scene for every event, and the events of other plots that intersect it: the
same event, at the same moment and in the same place. The model writes the scene
from the event, and every one of the events points at the whole of the markdown
cell that tells it, and takes part with every character the scene names; a
character the story does not have yet is added with a backstory no longer than
its part. Nothing else of the events or the concepts changes: a scene shows the
concepts of the plots its events belong to. The author reviews the scenes in the
editor."""

from __future__ import annotations

from uuid import uuid4

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.plot_cell import PlotNode
from authordoc.iterators.story_words_iterator import StoryWordsIterator
from authordoc.storydoc import Document
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import EditorShown, Shown
from server.story_generator.secondary_characters import with_the_characters_named
from server.story_generator.stage import Stage, StageStep

SCENE_INSTRUCTIONS = """You write one scene of an interactive story, the way a text adventure such as Zork shows a location: whoever reads it may have come to it from anywhere in the story, so it stands on its own. It says nothing of what happened before it, and nothing of what may happen after it. You are the story's narrator and its only witness: you never take part in what happens and never mention yourself. Write in the third person and the past tense.

You are given where the scene takes place and what happens there. Tell it.

Write two to five paragraphs of prose and nothing else."""

NAMES_INSTRUCTIONS = """You help an author keep track of the characters of an interactive story. You are given one of its scenes.

Write the name of every character the scene names, one to a line, and nothing else."""


class SceneStep(StageStep):
    """The scene that tells the events, written from the first of them into a
    markdown cell that every one of them points at."""

    def __init__(self, events: list[PlotNode], model: CompletingModel) -> None:
        self._events = events
        self._model = model

    async def __call__(self, document: Document) -> Document:
        event, *_ = self._events
        story = InteractiveAuthorStory(document)
        place_name = story.place_name_of(event)
        who = story.names_of_the_characters_in(event) or "no one named"
        request = f"Where: {place_name}\nWho: {who}\n\nWhat happens:\n{event.summary}"
        messages = [{"role": "system", "content": SCENE_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        scene = written.strip()

        messages_for_the_names = [{"role": "system", "content": NAMES_INSTRUCTIONS}, {"role": "user", "content": scene}]
        streamed_names = self._model.complete(messages_for_the_names)
        name_chunks = [chunk.content async for chunk in streamed_names]
        names_written = "".join(name_chunks)
        names_listed = [line.strip().lstrip("-* ").strip() for line in names_written.splitlines()]
        names = [name for name in names_listed if name]

        cell = MarkdownCell(scene, False, None, str(uuid4()))
        with_the_scene = document.with_cells([*document.cells, cell])
        story_words = StoryWordsIterator(with_the_scene)
        scene_words = story_words.range_between(cell.unique_id, 0, len(scene))
        story_with_the_scene = InteractiveAuthorStory(with_the_scene)
        story_with_its_characters, characters_named = await with_the_characters_named(
            story_with_the_scene, names, f"The scene:\n{scene}", self._model
        )
        told = story_with_its_characters.document
        for event in self._events:
            plot = told.get_plot_of_node(event)
            characters_of_the_event = event.characters(told)
            ids_of_the_event = [character.unique_id for character in characters_of_the_event]
            joining = [character for character in characters_named if character.unique_id not in ids_of_the_event]
            event_with_its_words = event.with_story_word_range(scene_words)
            event_told = event_with_its_words.with_characters([*characters_of_the_event, *joining])
            plot_told = plot.with_node(event_told)
            told = told.with_cell(plot_told)
        return told


class Scenes(Stage):

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel]) -> None:
        self._deployment = deployment

    def run(self, document: Document) -> list[StageStep]:
        model = self._deployment.client_async()
        # Events at the same moment and in the same place are one scene.
        events_of_scene: dict[tuple[str, str], list[PlotNode]] = {}
        for plot in document.plots():
            for event in plot.nodes:
                events = events_of_scene.setdefault((event.timestamp, event.place_id), [])
                events.append(event)
        scene_steps: list[StageStep] = [SceneStep(events, model) for events in events_of_scene.values()]
        return scene_steps

    def shown(self) -> Shown:
        return EditorShown()
