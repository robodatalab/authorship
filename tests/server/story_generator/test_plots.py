import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock

from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.secondary_characters import SECONDARY_CHARACTER_INSTRUCTIONS
from server.story_generator.stages.plots import ENDS_INSTRUCTIONS, IN_BETWEEN_INSTRUCTIONS, Plots


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
        written = InteractiveAuthorStory(with_every_event).written_world_events("")
        self.assertEqual(
            written,
            "### Motherhood\n"
            "1 | earth, Varn's house | Varn | Varn learns she is pregnant.\n"
            "2 | earth, Varn's house | Varn | Varn hides it from mission control.\n"
            "3 | mars, the base | Varn | Varn gives birth on Mars.\n"
            "4 | mars, the base | Varn | Varn raises her son on Mars.",
        )
        (plot,) = with_every_event.plots()
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

        _, _, _, earth, varns_house, mars, the_base = with_every_event.cells
        self.assertEqual(
            [
                (earth.title, earth.parent(with_every_event)),
                (varns_house.title, varns_house.parent(with_every_event)),
                (mars.title, mars.parent(with_every_event)),
                (the_base.title, the_base.parent(with_every_event)),
            ],
            [("earth", None), ("Varn's house", earth), ("mars", None), ("the base", mars)],
        )


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


class PlotEndsStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_writes_the_ends_into_the_first_and_last_events_of_the_plot(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        varn = CharacterCell("Varn", "A captain.", False, None, "v1", ["k1"])
        document = Document.from_cells([concept, varn])
        model = Mock()
        deployment = Mock()
        deployment.client_async.return_value = model
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn | Varn buries her son on Mars."
            ),
        ]
        lay_out, ends, _, _ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        with_the_ends = await ends(laid_out)

        model.complete.assert_called_once_with(
            [
                {"role": "system", "content": ENDS_INSTRUCTIONS},
                {"role": "user", "content": "Motherhood: A mother's care.\n\nThe main characters:\n### Varn\nA captain."},
            ],
        )
        written = InteractiveAuthorStory(with_the_ends).written_world_events("")
        self.assertEqual(
            written,
            "### Motherhood\n"
            "1 | earth, Varn's house | Varn | Varn learns she is pregnant.\n"
            " |  |  | \n"
            " |  |  | \n"
            "4 | mars, the base | Varn | Varn buries her son on Mars.",
        )

    async def test_adds_a_character_the_story_does_not_have_yet_with_a_short_backstory(self) -> None:
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
            streamed("The base's only doctor, who has never delivered a child."),
        ]
        lay_out, ends, _, _ = Plots(deployment).run(document)
        laid_out = await lay_out(document)

        with_the_ends = await ends(laid_out)

        model.complete.assert_called_with(
            [
                {"role": "system", "content": SECONDARY_CHARACTER_INSTRUCTIONS},
                {"role": "user", "content": "The character: Dr Okafor\n\nThe event:\nDr Okafor delivers Varn's son."},
            ],
        )
        okafor = InteractiveAuthorStory(with_the_ends).character_named("Dr Okafor")
        (plot,) = with_the_ends.plots()
        *_, the_end = plot.nodes
        self.assertEqual(
            (okafor.source, okafor.concepts(with_the_ends), the_end.characters(with_the_ends)),
            ("The base's only doctor, who has never delivered a child.", [concept], [varn, okafor]),
        )
