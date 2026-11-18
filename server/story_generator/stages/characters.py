from __future__ import annotations

import re

from authordoc.cells.character_cell import CHARACTER, CharacterCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from server.story_generator.interactive_author_story import InteractiveAuthorStory, written_under_their_titles
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.story_generator.review import CellsShown, Shown
from server.story_generator.stage import Stage, StageStep

CAST_INSTRUCTIONS = """You help an author cast the main characters of an interactive story built from its salient concepts: the ideas a reader should come away understanding.

You are given the concepts, each under its title with its description. Decide the main characters the story cannot show its concepts without: a love story needs its two lovers, a love triangle its three people, an injustice the one who suffers it and the one who commits it. One character may serve several concepts. Cast no one that no concept needs.

Write every character as its name on a line of its own, opened with "### ", then a line for every concept it serves, opened with "- " and followed by the concept's title exactly as it is given, then its role in the story in one or two sentences, and nothing else."""

BACKSTORY_INSTRUCTIONS = """You help an author write the backstory of one of the main characters of an interactive story built from its salient concepts: the ideas a reader should come away understanding.

You are given the character with its role in the story, the concepts it serves, each under its title with its description, and the rest of the main cast. Write the character's backstory: who they are and where they come from, what they want and what they fear, what binds them to the rest of the cast, and what in their past makes them the one to show the concepts they serve.

Write two to four paragraphs of prose and nothing else."""


def _read_cast(written: str) -> list[tuple[str, list[str], str]]:
    _, *blocks = re.split(r"^### ", written, flags=re.MULTILINE)
    cast: list[tuple[str, list[str], str]] = []
    for block in blocks:
        name, _, said = block.partition("\n")
        lines = said.strip().splitlines()
        concept_titles = [line.removeprefix("- ").strip() for line in lines if line.startswith("- ")]
        role_lines = [line for line in lines if not line.startswith("- ")]
        role = "\n".join(role_lines).strip()
        character = (name.strip(), concept_titles, role)
        cast.append(character)
    return cast


def _main_cast(document: Document) -> list[CharacterCell]:
    characters = [cell for cell in document.cells if isinstance(cell, CharacterCell)]
    cast = [character for character in characters if character.concepts(document)]
    return cast


class CastStep(StageStep):

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    async def __call__(self, document: Document) -> Document:
        story = InteractiveAuthorStory(document)
        concepts_written = story.written_concepts()
        request = f"The concepts:\n{concepts_written}"
        messages = [{"role": "system", "content": CAST_INSTRUCTIONS}, {"role": "user", "content": request}]
        streamed = self._model.complete(messages)
        chunks = [chunk.content async for chunk in streamed]
        written = "".join(chunks)

        concepts = document.salient_concepts()
        concept_of_title = {concept.title: concept for concept in concepts}
        cast_written = _read_cast(written)
        cast: list[CharacterCell] = []
        for name, concept_titles, role in cast_written:
            served = [concept_of_title[title] for title in concept_titles if title in concept_of_title]
            known = story.character_named(name)
            character = CharacterCell(name, role) if known is None else known
            character_serving = character.with_concepts(served)
            cast.append(character_serving)
        cast_ids = {character.unique_id for character in cast}
        others = [
            cell
            for cell in document.cells
            if not isinstance(cell, SalientConceptCell) and cell.unique_id not in cast_ids
        ]
        with_the_cast = document.with_cells([*concepts, *cast, *others])
        return with_the_cast


class BackstoriesStep(StageStep):

    def __init__(self, model: CompletingModel) -> None:
        self._model = model

    async def __call__(self, document: Document) -> Document:
        with_the_backstories = document
        for character in _main_cast(document):
            concepts_served = character.concepts(document)
            concepts_written = written_under_their_titles(concepts_served)
            main_cast_so_far = _main_cast(with_the_backstories)
            rest_of_the_cast = [other for other in main_cast_so_far if other.unique_id != character.unique_id]
            rest_written = written_under_their_titles(rest_of_the_cast)
            request = (
                f"The character: {character.title}\n{character.source}\n\n"
                f"The concepts it serves:\n{concepts_written}\n\n"
                f"The rest of the main cast:\n{rest_written}"
            )
            messages = [{"role": "system", "content": BACKSTORY_INSTRUCTIONS}, {"role": "user", "content": request}]
            streamed = self._model.complete(messages)
            chunks = [chunk.content async for chunk in streamed]
            written = "".join(chunks)
            backstory = written.strip()
            with_the_backstory = character.with_source(backstory)
            with_the_backstories = with_the_backstories.with_cell(with_the_backstory)
        return with_the_backstories


class Characters(Stage):

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel]) -> None:
        self._deployment = deployment

    def run(self, document: Document) -> list[StageStep]:
        model = self._deployment.client_async()
        cast_step = CastStep(model)
        backstories_step = BackstoriesStep(model)
        characters_steps: list[StageStep] = [cast_step, backstories_step]
        return characters_steps

    def shown(self) -> Shown:
        return CellsShown(CHARACTER)
