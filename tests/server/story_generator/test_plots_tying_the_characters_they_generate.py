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


class PlotsTyingTheCharactersTheyGenerate(unittest.IsolatedAsyncioTestCase):
    async def test_ties_a_character_an_end_generates_to_the_plot_and_its_concept(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "A captain.", False, None, "v1", ["k1"])
        document = Document.from_cells([concept, varn])
        model = Mock()
        deployment = Mock()
        deployment.client_async.return_value = model
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn, Dr Okafor | Dr Okafor delivers Varn's son."
            ),
            streamed("The base's only doctor."),
        ]
        lay_out, ends, _, _ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        with_the_ends = await ends(laid_out)

        okafor = InteractiveAuthorStory(with_the_ends).character_named("Dr Okafor")
        (plot,) = with_the_ends.plots()
        self.assertEqual(
            (plot.characters(with_the_ends), okafor.concepts(with_the_ends)),
            ([varn, okafor], [concept]),
        )

    async def test_ties_a_character_an_event_between_the_ends_generates_to_the_plot_and_its_concept(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "A captain.", False, None, "v1", ["k1"])
        document = Document.from_cells([concept, varn])
        model = Mock()
        deployment = Mock()
        deployment.client_async.return_value = model
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn | Varn raises her son on Mars."
            ),
            streamed("2 | earth, Varn's house | Varn, Mira | Varn tells her sister Mira."),
            streamed("Varn's sister."),
            streamed("3 | mars, the base | Varn | Varn gives birth on Mars."),
        ]
        lay_out, ends, second_event, third_event = Plots(deployment).run(document)
        laid_out = await lay_out(document)
        with_the_ends = await ends(laid_out)
        with_the_second_event = await second_event(with_the_ends)

        with_every_event = await third_event(with_the_second_event)

        mira = InteractiveAuthorStory(with_every_event).character_named("Mira")
        (plot,) = with_every_event.plots()
        self.assertEqual(
            (plot.characters(with_every_event), mira.concepts(with_every_event)),
            ([varn, mira], [concept]),
        )

    async def test_leaves_a_character_of_the_cast_an_event_names_as_it_is(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "A captain.", False, None, "v1", ["k1"])
        dax = CharacterCell("Dax", "A thief.", False, None, "d1")
        document = Document.from_cells([concept, varn, dax])
        model = Mock()
        deployment = Mock()
        deployment.client_async.return_value = model
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn, Dax | Dax steals Varn's ration card.\n"
                "4 | mars, the base | Varn | Varn raises her son on Mars."
            ),
        ]
        lay_out, ends, _, _ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        with_the_ends = await ends(laid_out)

        dax_after = InteractiveAuthorStory(with_the_ends).character_named("Dax")
        (plot,) = with_the_ends.plots()
        self.assertEqual(
            (plot.characters(with_the_ends), dax_after.concepts(with_the_ends)),
            ([varn], []),
        )
