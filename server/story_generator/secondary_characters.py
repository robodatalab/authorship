from __future__ import annotations

from authordoc.cells.character_cell import CharacterCell
from cortexgrid_infer import CompletingModel
from server.story_generator.interactive_author_story import InteractiveAuthorStory

SECONDARY_CHARACTER_INSTRUCTIONS = """You help an author write an interactive story. A character the story has no backstory for takes part in the part of it you are given.

Write the character's backstory in one or two sentences: who they are, and why they take part. Write the sentences and nothing else."""


async def with_the_characters_named(
    story: InteractiveAuthorStory, names: list[str], taking_part_in: str, model: CompletingModel
) -> tuple[InteractiveAuthorStory, list[CharacterCell]]:
    characters: list[CharacterCell] = []
    for name in names:
        named = story.character_named(name)
        if named is None:
            request = f"The character: {name}\n\n{taking_part_in}"
            messages = [{"role": "system", "content": SECONDARY_CHARACTER_INSTRUCTIONS}, {"role": "user", "content": request}]
            streamed = model.complete(messages)
            chunks = [chunk.content async for chunk in streamed]
            written = "".join(chunks)
            backstory = written.strip()
            named = CharacterCell(name, backstory)
            story = story.with_character(named)
        characters.append(named)
    return story, characters
