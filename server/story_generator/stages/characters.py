from __future__ import annotations

from dataclasses import dataclass, replace
from random import Random

from authordoc.cells.character_cell import CHARACTER, CharacterCell
from authordoc.storydoc import Document
from server.story_generator.character_tables import CharacterTables
from server.story_generator.interactive_author_story import InteractiveAuthorStory
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.review import CellsShown, CommandShown, Shown
from server.story_generator.stage import Stage, StageStep

ADD_THE_CHARACTERS = CommandShown(CHARACTER, "insertCell")

GENRES_INSTRUCTIONS = """You help an author find the genres of an interactive story built from its salient concepts: the ideas a reader should come away understanding.

You are given the concepts, each under its title with its description, and the genres to choose from. Name every genre the concepts suggest: one, or several when the story mixes them, such as a romance in a space opera.

Write every genre you name on a line of its own, exactly as it is given, and nothing else."""


@dataclass
class StoryGenres:
    names: list[str]


class ReadGenresStep(StageStep):

    def __init__(self, model: CompletingModel, tables: CharacterTables, genres: StoryGenres) -> None:
        self._model = model
        self._tables = tables
        self._genres = genres

    async def __call__(self, document: Document) -> Document:
        story = InteractiveAuthorStory(document)
        concepts_written = story.written_concepts()
        genres_listed = "\n".join(self._tables.genres)
        request = f"The concepts:\n{concepts_written}\n\nThe genres:\n{genres_listed}"
        messages = [{"role": "system", "content": GENRES_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)
        lines = [line.strip().lstrip("-* ").strip().lower() for line in written.splitlines()]
        genres_named = [genre for genre in self._tables.genres if genre in lines]
        self._genres.names = genres_named or self._tables.genres
        return document


class RollCharacterStep(StageStep):

    def __init__(self, character_id: str, tables: CharacterTables, genres: StoryGenres, random: Random) -> None:
        self._character_id = character_id
        self._tables = tables
        self._genres = genres
        self._random = random

    async def __call__(self, document: Document) -> Document:
        character = document.cell_with_id(self._character_id)
        assert isinstance(character, CharacterCell)
        concepts = character.concepts(document)
        table = self._tables.pooled(self._genres.names)
        motivations_needed = max(1, len(concepts))
        rolled = table.roll(self._random, motivations_needed)
        name = character.title or f"{rolled.given_name} {rolled.family_name}"
        motivations = (
            [f"Motivation for {concept.title}: {motivation}" for concept, motivation in zip(concepts, rolled.motivations)]
            if concepts
            else [f"Motivation: {rolled.motivations[0]}"]
        )
        traits = ", ".join(rolled.traits)
        background = ", ".join(rolled.background)
        looks = ", ".join(rolled.looks)
        authors_backstory = character.source.strip()
        parts = [authors_backstory, *motivations, f"Traits: {traits}", f"Background: {background}", f"Looks: {looks}"]
        parts_written = [part for part in parts if part]
        backstory = "\n\n".join(parts_written)
        character_rolled = replace(character, title=name, source=backstory)
        with_the_character_rolled = document.with_cell(character_rolled)
        return with_the_character_rolled


class Cast(Stage):

    def run(self, document: Document) -> list[StageStep]:
        return []

    def shown(self) -> Shown:
        return ADD_THE_CHARACTERS


class Characters(Stage):

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel], tables: CharacterTables, random: Random) -> None:
        self._deployment = deployment
        self._tables = tables
        self._random = random

    def run(self, document: Document) -> list[StageStep]:
        model = self._deployment.client_async()
        genres = StoryGenres(self._tables.genres)
        read_genres_step = ReadGenresStep(model, self._tables, genres)
        characters = [cell for cell in document.cells if isinstance(cell, CharacterCell)]
        roll_steps = [RollCharacterStep(character.unique_id, self._tables, genres, self._random) for character in characters]
        characters_steps: list[StageStep] = [read_genres_step, *roll_steps]
        return characters_steps

    def shown(self) -> Shown:
        return CellsShown(CHARACTER)
