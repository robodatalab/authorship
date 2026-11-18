import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock

from authordoc.cells.character_cell import CHARACTER, CharacterCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.review import CellsShown
from server.story_generator.stages.characters import (
    BACKSTORY_INSTRUCTIONS,
    CAST_INSTRUCTIONS,
    BackstoriesStep,
    CastStep,
    Characters,
)


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class CastStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_casts_the_characters_the_concepts_need_after_the_concepts(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        war = SalientConceptCell("War", [], "A war far from home.", False, None, "k2")
        scene = MarkdownCell("The ship landed.", False, None, "s1")
        document = Document.from_cells([motherhood, war, scene])
        model = Mock()
        model.complete.side_effect = [
            streamed(
                "### Varn\n- Motherhood\n- War\nA captain torn between her command and her son.\n\n"
                "### Dax\n- War\n- Greed\nThe officer who hoards the water."
            ),
        ]

        cast = await CastStep(model)(document)

        model.complete.assert_called_once_with(
            [
                {"role": "system", "content": CAST_INSTRUCTIONS},
                {"role": "user", "content": "The concepts:\n### Motherhood\nA mother's care.\n\n### War\nA war far from home."},
            ],
        )
        first, second, varn, dax, last = cast.cells
        self.assertEqual(
            [
                (first, second, last),
                (varn.title, varn.source, varn.concepts(cast)),
                (dax.title, dax.source, dax.concepts(cast)),
            ],
            [
                (motherhood, war, scene),
                ("Varn", "A captain torn between her command and her son.", [motherhood, war]),
                ("Dax", "The officer who hoards the water.", [war]),
            ],
        )

    async def test_has_a_character_the_story_has_by_the_name_serve_its_concepts(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "She left the fleet.", False, None, "v1")
        document = Document.from_cells([motherhood, varn])
        model = Mock()
        model.complete.side_effect = [streamed("### Varn\n- Motherhood\nA captain and a mother.")]

        cast = await CastStep(model)(document)

        self.assertEqual(cast.cells, [motherhood, varn.with_concepts([motherhood])])


class BackstoriesStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_writes_the_backstory_of_every_main_character_in_the_light_of_the_rest_of_the_cast(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "A captain and a mother.", False, None, "v1", ["k1"])
        lia = CharacterCell("Lia", "Her daughter.", False, None, "d1", ["k1"])
        okafor = CharacterCell("Dr Okafor", "The base's doctor.", False, None, "o1")
        document = Document.from_cells([motherhood, varn, lia, okafor])
        model = Mock()
        model.complete.side_effect = [
            streamed("Varn grew up on the docks."),
            streamed("Lia was born in orbit."),
        ]

        with_the_backstories = await BackstoriesStep(model)(document)

        model.complete.assert_called_with(
            [
                {"role": "system", "content": BACKSTORY_INSTRUCTIONS},
                {
                    "role": "user",
                    "content": "The character: Lia\nHer daughter.\n\n"
                    "The concepts it serves:\n### Motherhood\nA mother's care.\n\n"
                    "The rest of the main cast:\n### Varn\nVarn grew up on the docks.",
                },
            ],
        )
        self.assertEqual(
            [cell.source for cell in with_the_backstories.cells],
            ["A mother's care.", "Varn grew up on the docks.", "Lia was born in orbit.", "The base's doctor."],
        )


class CharactersStage(unittest.TestCase):
    def test_casts_the_characters_then_writes_their_backstories(self) -> None:
        deployment = Mock()

        steps = Characters(deployment).run(Document.from_cells([]))

        self.assertEqual([type(step) for step in steps], [CastStep, BackstoriesStep])

    def test_is_reviewed_in_the_character_cells(self) -> None:
        shown = Characters(Mock()).shown()

        self.assertEqual(shown, CellsShown(CHARACTER))
