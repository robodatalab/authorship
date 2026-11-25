import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock

from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.stages.plots import IN_BETWEEN_INSTRUCTIONS, Plots


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class PlotsRun(unittest.IsolatedAsyncioTestCase):
    async def test_the_events_between_the_ends_are_written_halfway_between_written_events(self) -> None:
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
            streamed("2 | earth, Varn's house | Varn | Varn hides it from mission control."),
            streamed("3 | mars, the base | Varn | Varn gives birth on Mars."),
        ]

        lay_out, ends, second_event, third_event = Plots(deployment).run(document)
        laid_out = await lay_out(document)
        with_the_ends = await ends(laid_out)
        with_the_second_event = await second_event(with_the_ends)
        with_every_event = await third_event(with_the_second_event)

        model.complete.assert_called_with(
            [
                {"role": "system", "content": IN_BETWEEN_INSTRUCTIONS},
                {
                    "role": "user",
                    "content": "Motherhood: A mother's care.\n\n"
                    "The main characters:\n### Varn\nA captain.\n\n"
                    "The event before:\n2 | earth, Varn's house | Varn | Varn hides it from mission control.\n\n"
                    "The event after:\n4 | mars, the base | Varn | Varn raises her son on Mars.",
                },
            ],
        )
        (plot,) = with_every_event.plots()
        first, second, third, fourth = plot.nodes
        self.assertEqual(
            [
                (first.timestamp, first.place(with_every_event).title, first.characters(with_every_event), first.summary),
                (second.timestamp, second.place(with_every_event).title, second.characters(with_every_event), second.summary),
                (third.timestamp, third.place(with_every_event).title, third.characters(with_every_event), third.summary),
                (fourth.timestamp, fourth.place(with_every_event).title, fourth.characters(with_every_event), fourth.summary),
            ],
            [
                ("1", "earth, Varn's house", [varn], "Varn learns she is pregnant."),
                ("2", "earth, Varn's house", [varn], "Varn hides it from mission control."),
                ("3", "mars, the base", [varn], "Varn gives birth on Mars."),
                ("4", "mars, the base", [varn], "Varn raises her son on Mars."),
            ],
        )
        self.assertEqual(plot.concepts(with_every_event), [concept])

    async def test_every_plot_follows_the_main_characters_of_its_concept(self) -> None:
        motherhood = SalientConceptCell("Motherhood", [], "", False, None, "k1")
        war = SalientConceptCell("War", [], "", False, None, "k2")
        varn = CharacterCell("Varn", "", False, None, "v1", ["k1", "k2"])
        dax = CharacterCell("Dax", "", False, None, "x1", ["k2"])
        lia = CharacterCell("Lia", "", False, None, "d1")
        document = Document.from_cells([motherhood, war, varn, dax, lia])
        deployment = Mock()

        lay_out, *_ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        plot_of_motherhood, plot_of_war = laid_out.plots()
        self.assertEqual(
            (plot_of_motherhood.characters(laid_out), plot_of_war.characters(laid_out)),
            ([varn], [varn, dax]),
        )

    async def test_every_place_the_events_name_is_added_once(self) -> None:
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
            streamed("2 | earth, Varn's house | Varn | Varn hides it from mission control."),
            streamed("3 | mars, the base | Varn | Varn gives birth on Mars."),
        ]

        lay_out, ends, second_event, third_event = Plots(deployment).run(document)
        laid_out = await lay_out(document)
        with_the_ends = await ends(laid_out)
        with_the_second_event = await second_event(with_the_ends)
        with_every_event = await third_event(with_the_second_event)

        _, _, _, varns_house, the_base = with_every_event.cells
        self.assertEqual((varns_house.title, the_base.title), ("earth, Varn's house", "mars, the base"))
