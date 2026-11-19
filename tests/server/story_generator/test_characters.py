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
    motivations=["being loved"],
    traits={"temperament": ["shy"], "quirk": ["hums"], "flaw": ["grudges"]},
    background={"upbringing": ["mining colony"], "family": ["alcoholic parent"], "occupation": ["mechanic"], "turning point": ["debt"]},
    looks={"build": ["wiry"], "features": ["burn scar"], "style": ["flight jacket"]},
)

ROMANCE = CharacterTable(
    given_names=["Clara"],
    family_names=["Bell"],
    motivations=["loving someone"],
    traits={"temperament": ["warm"], "quirk": ["writes letters"], "flaw": ["jealous"]},
    background={"upbringing": ["seaside town"], "family": ["rich father"], "occupation": ["florist"], "turning point": ["inheritance"]},
    looks={"build": ["small"], "features": ["freckles"], "style": ["thrifted silk"]},
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
                    "Motivation for Motherhood: being loved\n\n"
                    "Traits: shy, hums, grudges\n\n"
                    "Background: mining colony, alcoholic parent, mechanic, debt\n\n"
                    "Looks: wiry, burn scar, flight jacket",
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
                    "Motivation: loving someone\n\n"
                    "Traits: warm, writes letters, jealous\n\n"
                    "Background: seaside town, rich father, florist, inheritance\n\n"
                    "Looks: small, freckles, thrifted silk",
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
