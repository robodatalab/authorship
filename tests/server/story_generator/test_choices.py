import random
import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock, patch

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.plot_cell import PlotCell, PlotEdge, PlotNode
from authordoc.cells.story_word_range import StoryWordRange
from authordoc.iterators.story_words_iterator import StoryWordsIterator
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import TerminalReview
from server.story_generator.stages.choices import CHOICES_INSTRUCTIONS, Choices


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class ChoicesRun(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        # The story's words: the meeting, "Dax(0) ... close.(9)", which both plots
        # leave, then "Varn(10) ... cup.(16)" and "Dax(17) ... them.(22)", where
        # each of them ends.
        varn = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", StoryWordRange(0, 9), "1", "mars, the base", "Dax takes the water from Varn and her son."),
                PlotNode("e2", StoryWordRange(10, 16), "2", "mars, Varn's room", "Varn shares her water with her son."),
            ],
            [PlotEdge("x1", "e1", "e2")],
            "",
            False,
            None,
            "p1",
        )
        dax = PlotCell(
            "Brutal father",
            [
                PlotNode("f1", StoryWordRange(0, 9), "1", "mars, the base", "Dax takes the water from Varn and her son."),
                PlotNode("f2", StoryWordRange(17, 22), "2.5", "mars, the base", "Dax drinks in front of the thirsty."),
            ],
            [PlotEdge("x2", "f1", "f2")],
            "",
            False,
            None,
            "p2",
        )
        self.document = Document.from_cells(
            [
                varn,
                dax,
                MarkdownCell("Dax took the water while Varn held her son close.", False, None, "s1"),
                MarkdownCell("Varn gave her son the last cup.", False, None, "s2"),
                MarkdownCell("Dax drank in front of them.", False, None, "s3"),
            ]
        )
        chance = random.Random(0)
        self.reviews = TerminalReview(0.0, chance)
        self.model = Mock()
        self.model.complete.return_value = streamed("1. Varn followed the water to her room.\n2. Dax raised his cup to the crowd.")

    # The author accepts the choices shown.
    @patch("builtins.input", return_value="a")
    async def test_ends_the_scene_with_a_choice_for_every_edge_leaving_it(self, _) -> None:
        (where_they_meet,) = Choices(self.model).run(self.document)

        _, with_the_choices = await where_they_meet(self.document, self.reviews, "")

        story = InteractiveAuthorStory(with_the_choices)
        meeting, _, _ = story.scenes
        self.assertEqual(meeting.options, {"x1": "Varn followed the water to her room.", "x2": "Dax raised his cup to the crowd."})

    # The author accepts the choices shown.
    @patch("builtins.input", return_value="a")
    async def test_every_event_keeps_pointing_at_its_scene_once_the_choices_are_written(self, _) -> None:
        (where_they_meet,) = Choices(self.model).run(self.document)

        _, with_the_choices = await where_they_meet(self.document, self.reviews, "")

        story_words = StoryWordsIterator(with_the_choices)
        varn, dax = with_the_choices.plots()
        meeting_of_varn, varns_room = varn.nodes
        meeting_of_dax, dax_drinks = dax.nodes
        self.assertEqual(story_words.text(meeting_of_varn.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(meeting_of_dax.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(varns_room.story_word_range), "Varn gave her son the last cup.")
        self.assertEqual(story_words.text(dax_drinks.story_word_range), "Dax drank in front of them.")

    @patch("builtins.input", return_value="a")
    async def test_asks_for_the_choices_of_a_scene_at_once(self, _) -> None:
        (where_they_meet,) = Choices(self.model).run(self.document)

        await where_they_meet(self.document, self.reviews, "")

        self.model.complete.assert_called_once_with(
            [
                {"role": "system", "content": CHOICES_INSTRUCTIONS},
                {
                    "role": "user",
                    "content": "The scene:\nDax took the water while Varn held her son close.\n\n"
                    "What could happen next:\n"
                    "1. mars, Varn's room: Varn shares her water with her son.\n"
                    "Varn gave her son the last cup.\n\n"
                    "2. mars, the base: Dax drinks in front of the thirsty.\n"
                    "Dax drank in front of them.\n\n",
                },
            ],
            max_new_tokens=500,
        )
