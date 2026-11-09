import random
import unittest
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, Mock

from authordoc.cells.plot_cell import PLOT
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import AnnotationShown, Answer, Review, ReviewResult
from server.story_generator.stages.plots import ENDS_INSTRUCTIONS, IN_BETWEEN_INSTRUCTIONS, Plots


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class PlotsRun(unittest.IsolatedAsyncioTestCase):
    async def test_the_events_between_the_ends_are_written_halfway_between_written_events(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        document = Document.from_cells([concept])
        # The author accepts every event shown.
        author = Mock()
        author.review = AsyncMock(return_value=Answer(ReviewResult.success(), ""))
        reviews = Review(0.0, random.Random(0), author)
        model = Mock()
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn raises her son on Mars."
            ),
            streamed("2 | earth, Varn's house | Varn hides it from mission control."),
            streamed("3 | mars, the base | Varn gives birth on Mars."),
        ]

        lay_out, ends, second_event, third_event = Plots(model).run(document)
        _, laid_out = await lay_out(document, reviews, "")
        _, with_the_ends = await ends(laid_out, reviews, "")
        _, with_the_second_event = await second_event(with_the_ends, reviews, "")
        _, with_every_event = await third_event(with_the_second_event, reviews, "")

        model.complete.assert_called_with(
            [
                {"role": "system", "content": IN_BETWEEN_INSTRUCTIONS},
                {
                    "role": "user",
                    "content": "Motherhood: A mother's care.\n\n"
                    "The event before:\n2 | earth, Varn's house | Varn hides it from mission control.\n\n"
                    "The event after:\n4 | mars, the base | Varn raises her son on Mars.\n\n",
                },
            ],
            max_new_tokens=300,
        )
        written = InteractiveAuthorStory(with_every_event).written_world_events("")
        self.assertEqual(
            written,
            "### Motherhood\n"
            "1 | earth, Varn's house | Varn learns she is pregnant.\n"
            "2 | earth, Varn's house | Varn hides it from mission control.\n"
            "3 | mars, the base | Varn gives birth on Mars.\n"
            "4 | mars, the base | Varn raises her son on Mars.",
        )
        (plot,) = with_every_event.plots()
        self.assertEqual(plot.concepts(with_every_event), [concept])


class PlotEndsStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_writes_the_ends_again_with_the_authors_feedback_until_the_author_accepts(self) -> None:
        concept = SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1")
        document = Document.from_cells([concept])
        # The author has the first ends done again, then accepts the second.
        author = Mock()
        author.review = AsyncMock(
            side_effect=[
                Answer(ReviewResult.failed("make it end in loss"), ""),
                Answer(ReviewResult.success(), ""),
            ]
        )
        reviews = Review(0.0, random.Random(0), author)
        model = Mock()
        model.complete.side_effect = [
            streamed(
                "1 | earth, Varn's house | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn raises her son on Mars."
            ),
            streamed(
                "1 | earth, Varn's house | Varn learns she is pregnant.\n"
                "4 | mars, the base | Varn buries her son on Mars."
            ),
        ]
        lay_out, ends, _, _ = Plots(model).run(document)
        _, laid_out = await lay_out(document, reviews, "")

        first_result, _ = await ends(laid_out, reviews, "")
        _, with_the_ends = await ends(laid_out, reviews, first_result.comment)

        self.assertEqual(first_result, ReviewResult.failed("make it end in loss"))
        model.complete.assert_called_with(
            [
                {"role": "system", "content": ENDS_INSTRUCTIONS},
                {"role": "user", "content": "Motherhood: A mother's care.\n\nmake it end in loss"},
            ],
            max_new_tokens=500,
        )
        written = InteractiveAuthorStory(with_the_ends).written_world_events("")
        self.assertEqual(
            written,
            "### Motherhood\n"
            "1 | earth, Varn's house | Varn learns she is pregnant.\n"
            " |  | \n"
            " |  | \n"
            "4 | mars, the base | Varn buries her son on Mars.",
        )
        # The author is shown the plot, at its first event.
        (plot,) = with_the_ends.plots()
        first_event, *_ = plot.nodes
        _, shown = author.review.await_args.args
        self.assertEqual(shown, AnnotationShown(PLOT, plot.unique_id, first_event.node_id))
