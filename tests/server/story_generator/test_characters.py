import unittest
from collections.abc import AsyncIterator
from random import Random
from unittest.mock import Mock

from authordoc.cells.character_cell import CHARACTER, CharacterCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.character_tables import CharacterTable, CharacterTables
from server.story_generator.review import CellsShown, CommandShown
from server.story_generator.stages.characters import (
    GENRES_INSTRUCTIONS,
    Cast,
    Characters,
    ReadGenresStep,
    RollCharacterStep,
    StoryGenres,
)

SPACE_OPERA = CharacterTable(
    given_names=["Ines"],
    family_names=["Okafor"],
    motivations=["lonely since leaving home"],
    traits={"temperament": ["shy and watchful"], "quirk": ["hums when nervous"], "flaw": ["holds grudges for years"]},
    background={
        "upbringing": ["grew up poor in a mining colony"],
        "family": ["raised by an alcoholic parent"],
        "occupation": ["a ship's mechanic"],
        "turning point": ["signed on to escape a debt collector"],
    },
    looks={"build": ["tall and wiry"], "features": ["a burn scar across one cheek"], "style": ["wears a patched flight jacket"]},
)

ROMANCE = CharacterTable(
    given_names=["Clara"],
    family_names=["Bell"],
    motivations=["remembers the parents' devoted love and wants the same"],
    traits={"temperament": ["warm and teasing"], "quirk": ["writes letters never sent"], "flaw": ["falls too fast"]},
    background={
        "upbringing": ["grew up above a seaside bakery"],
        "family": ["the neglected child of a rich father"],
        "occupation": ["a florist"],
        "turning point": ["came home to sell the family house"],
    },
    looks={"build": ["small and quick"], "features": ["freckles and unruly red hair"], "style": ["dresses in thrifted silk"]},
)

TABLES = CharacterTables({"space opera": SPACE_OPERA, "romance": ROMANCE})


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class ReadGenresStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_names_the_genres_the_concepts_suggest_of_those_the_tables_have(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        document = Document.from_cells([motherhood])
        model = Mock()
        model.complete.side_effect = [streamed("Romance\n- space opera\nwestern")]
        genres = StoryGenres(["space opera", "romance"])

        read = await ReadGenresStep(model, TABLES, genres)(document)

        model.complete.assert_called_once_with(
            [
                {"role": "system", "content": GENRES_INSTRUCTIONS},
                {
                    "role": "user",
                    "content": "The concepts:\n### Motherhood\nA mother's care.\n\nThe genres:\nspace opera\nromance",
                },
            ],
        )
        self.assertEqual([read, genres.names], [document, ["space opera", "romance"]])

    async def test_keeps_every_genre_when_the_model_names_none_of_them(self) -> None:
        document = Document.from_cells([])
        model = Mock()
        model.complete.side_effect = [streamed("cosy mystery")]
        genres = StoryGenres(["space opera", "romance"])

        await ReadGenresStep(model, TABLES, genres)(document)

        self.assertEqual(genres.names, ["space opera", "romance"])


class RollCharacterStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_rolls_the_backstory_from_the_tables_of_the_story_genres_after_the_authors(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "She left the fleet.", False, None, "v1", ["k1"])
        document = Document.from_cells([motherhood, varn])

        rolled = await RollCharacterStep("v1", TABLES, StoryGenres(["space opera"]), Random(0))(document)

        self.assertEqual(
            rolled.cells,
            [
                motherhood,
                CharacterCell(
                    "Varn",
                    "She left the fleet.\n\n"
                    "Motivation for Motherhood: lonely since leaving home\n\n"
                    "Traits: shy and watchful; hums when nervous; holds grudges for years\n\n"
                    "Background: grew up poor in a mining colony; raised by an alcoholic parent; "
                    "a ship's mechanic; signed on to escape a debt collector\n\n"
                    "Looks: tall and wiry; a burn scar across one cheek; wears a patched flight jacket",
                    False,
                    None,
                    "v1",
                    ["k1"],
                ),
            ],
        )

    async def test_names_a_character_the_author_left_unnamed(self) -> None:
        unnamed = CharacterCell("", "", False, None, "u1")
        document = Document.from_cells([unnamed])

        rolled = await RollCharacterStep("u1", TABLES, StoryGenres(["romance"]), Random(0))(document)

        self.assertEqual(
            rolled.cells,
            [
                CharacterCell(
                    "Clara Bell",
                    "Motivation: remembers the parents' devoted love and wants the same\n\n"
                    "Traits: warm and teasing; writes letters never sent; falls too fast\n\n"
                    "Background: grew up above a seaside bakery; the neglected child of a rich father; "
                    "a florist; came home to sell the family house\n\n"
                    "Looks: small and quick; freckles and unruly red hair; dresses in thrifted silk",
                    False,
                    None,
                    "u1",
                ),
            ],
        )


class CastStage(unittest.TestCase):
    def test_does_no_work_of_its_own(self) -> None:
        steps = Cast().run(Document.from_cells([]))

        self.assertEqual(steps, [])

    def test_asks_the_author_to_add_the_characters(self) -> None:
        shown = Cast().shown()

        self.assertEqual(shown, CommandShown(CHARACTER, "insertCell"))


class CharactersStage(unittest.TestCase):
    def test_reads_the_genres_then_rolls_every_character(self) -> None:
        varn = CharacterCell("Varn", "", False, None, "v1")
        lia = CharacterCell("Lia", "", False, None, "l1")

        steps = Characters(Mock(), TABLES, Random(0)).run(Document.from_cells([varn, lia]))

        self.assertEqual(
            [type(step) for step in steps],
            [ReadGenresStep, RollCharacterStep, RollCharacterStep],
        )

    def test_is_reviewed_in_the_character_cells(self) -> None:
        shown = Characters(Mock(), TABLES, Random(0)).shown()

        self.assertEqual(shown, CellsShown(CHARACTER))
