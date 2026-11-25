import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock

from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.stages.plots import ENDS_INSTRUCTIONS, SECONDARY_CHARACTER_INSTRUCTIONS, Plots


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


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
        (plot,) = with_the_ends.plots()
        start, second, third, end = plot.nodes
        self.assertEqual(
            [
                (start.timestamp, start.place(with_the_ends).title, start.characters(with_the_ends), start.summary),
                (second.timestamp, second.place(with_the_ends), second.characters(with_the_ends), second.summary),
                (third.timestamp, third.place(with_the_ends), third.characters(with_the_ends), third.summary),
                (end.timestamp, end.place(with_the_ends).title, end.characters(with_the_ends), end.summary),
            ],
            [
                ("1", "earth, Varn's house", [varn], "Varn learns she is pregnant."),
                ("", None, [], ""),
                ("", None, [], ""),
                ("4", "mars, the base", [varn], "Varn buries her son on Mars."),
            ],
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
        (plot,) = with_the_ends.plots()
        *_, the_end = plot.nodes
        varn_at_the_end, okafor = the_end.characters(with_the_ends)
        self.assertEqual(
            (varn_at_the_end, okafor.title, okafor.source, okafor.concepts(with_the_ends)),
            (varn, "Dr Okafor", "The base's only doctor, who has never delivered a child.", [concept]),
        )
