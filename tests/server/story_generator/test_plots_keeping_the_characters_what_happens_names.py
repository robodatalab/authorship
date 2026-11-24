import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock

from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.stages.plots import Plots


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class PlotsKeepingTheCharactersWhatHappensNames(unittest.IsolatedAsyncioTestCase):
    async def test_leaves_out_a_character_of_the_cast_what_happens_does_not_name(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "A captain.", False, None, "v1", ["k1"])
        dax = CharacterCell("Dax", "A thief.", False, None, "d1")
        document = Document.from_cells([concept, varn, dax])
        model = Mock()
        deployment = Mock()
        deployment.client_async.return_value = model
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn, Dax | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn | Varn raises her son on Mars."
            ),
        ]
        lay_out, ends, _, _ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        with_the_ends = await ends(laid_out)

        (plot,) = with_the_ends.plots()
        the_start, *_ = plot.nodes
        self.assertEqual(the_start.characters(with_the_ends), [varn])

    async def test_adds_no_character_what_happens_does_not_name(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "A captain.", False, None, "v1", ["k1"])
        document = Document.from_cells([concept, varn])
        model = Mock()
        deployment = Mock()
        deployment.client_async.return_value = model
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn, Dr Okafor | Varn gives birth alone."
            ),
        ]
        lay_out, ends, _, _ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        with_the_ends = await ends(laid_out)

        okafor = InteractiveAuthorStory(with_the_ends).character_named("Dr Okafor")
        (plot,) = with_the_ends.plots()
        *_, the_end = plot.nodes
        self.assertEqual((okafor, the_end.characters(with_the_ends)), (None, [varn]))

    async def test_keeps_a_character_what_happens_names_by_one_of_their_names(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn Hale", "A captain.", False, None, "v1", ["k1"])
        document = Document.from_cells([concept, varn])
        model = Mock()
        deployment = Mock()
        deployment.client_async.return_value = model
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn Hale | Varn's ship is grounded.\n"
                "4 | mars, the base | Varn Hale | Captain Hale raises her son on Mars."
            ),
        ]
        lay_out, ends, _, _ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        with_the_ends = await ends(laid_out)

        (plot,) = with_the_ends.plots()
        the_start, *_, the_end = plot.nodes
        self.assertEqual((the_start.characters(with_the_ends), the_end.characters(with_the_ends)), ([varn], [varn]))
