import random
import unittest
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, Mock

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.plot_cell import PlotCell, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell, SalientConceptReference
from authordoc.cells.story_word_range import StoryWordRange
from authordoc.iterators.story_words_iterator import StoryWordsIterator
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.review import Answer, CellShown, Review, ReviewResult
from server.story_generator.stages.scenes import SCENE_INSTRUCTIONS, Scenes, SceneStep


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class ScenesRun(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        varn = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", None, "1", "mars, the base", "Dax takes the water from Varn and her son."),
                PlotNode("e2", None, "2", "mars, Varn's room", "Varn shares her water with her son."),
            ],
            [],
            "",
            False,
            None,
            "p1",
        )
        dax = PlotCell(
            "Brutal father",
            [
                PlotNode("f1", None, "1", "mars, the base", "Dax takes the water from Varn and her son."),
                PlotNode("f2", None, "2.5", "mars, the base", "Dax drinks in front of the thirsty."),
            ],
            [],
            "",
            False,
            None,
            "p2",
        )
        self.document = Document.from_cells([varn, dax])
        # The author accepts every scene shown.
        self.author = Mock()
        self.author.review = AsyncMock(return_value=Answer(ReviewResult.success(), ""))
        self.reviews = Review(0.0, random.Random(0), self.author)
        self.model = Mock()
        self.model.complete.side_effect = [
            streamed("Dax took the water while Varn held her son close."),
            streamed("Varn gave her son the last cup.\n\nHe drank it slowly."),
            streamed("Dax drank in front of them."),
        ]

    async def test_every_event_points_at_the_whole_of_its_scene(self) -> None:
        where_they_meet, in_varns_room, where_dax_drinks = Scenes(self.model).run(self.document)
        _, with_the_meeting = await where_they_meet(self.document, self.reviews, "")
        _, with_varns_room = await in_varns_room(with_the_meeting, self.reviews, "")
        _, with_every_scene = await where_dax_drinks(with_varns_room, self.reviews, "")

        story_words = StoryWordsIterator(with_every_scene)
        varn, dax = with_every_scene.plots()
        meeting_of_varn, varns_room = varn.nodes
        meeting_of_dax, dax_drinks = dax.nodes
        self.assertEqual(story_words.text(meeting_of_varn.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(meeting_of_dax.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(varns_room.story_word_range), "Varn gave her son the last cup.\n\nHe drank it slowly.")
        self.assertEqual(story_words.text(dax_drinks.story_word_range), "Dax drank in front of them.")

    async def test_every_event_keeps_pointing_at_its_scene_when_a_scene_before_it_grows(self) -> None:
        where_they_meet, in_varns_room, where_dax_drinks = Scenes(self.model).run(self.document)
        _, with_the_meeting = await where_they_meet(self.document, self.reviews, "")
        _, with_varns_room = await in_varns_room(with_the_meeting, self.reviews, "")
        _, with_every_scene = await where_dax_drinks(with_varns_room, self.reviews, "")
        story = InteractiveAuthorStory(with_every_scene)
        meeting, _, _ = story.scenes

        # As the choices stage grows a scene: the opening of a sentence it leaves unfinished.
        opened = meeting.with_opening("Varn looked at the door, and then at the window")
        grown = story.with_scenes([opened])

        story_words = StoryWordsIterator(grown.document)
        varn, dax = grown.document.plots()
        meeting_of_varn, varns_room = varn.nodes
        meeting_of_dax, dax_drinks = dax.nodes
        self.assertEqual(story_words.text(meeting_of_varn.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(meeting_of_dax.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(varns_room.story_word_range), "Varn gave her son the last cup.\n\nHe drank it slowly.")
        self.assertEqual(story_words.text(dax_drinks.story_word_range), "Dax drank in front of them.")

    async def test_shows_the_author_the_cell_of_the_scene(self) -> None:
        where_they_meet, _, _ = Scenes(self.model).run(self.document)

        _, with_the_meeting = await where_they_meet(self.document, self.reviews, "")

        *_, the_meeting = with_the_meeting.cells
        _, shown = self.author.review.await_args.args
        self.assertEqual(shown, CellShown(the_meeting.unique_id))

    async def test_asks_for_the_scene_once_where_events_intersect(self) -> None:
        where_they_meet, _, _ = Scenes(self.model).run(self.document)
        await where_they_meet(self.document, self.reviews, "")

        self.model.complete.assert_called_once_with(
            [
                {"role": "system", "content": SCENE_INSTRUCTIONS},
                {"role": "user", "content": "Where: mars, the base\n\nWhat happens:\nDax takes the water from Varn and her son.\n\n"},
            ],
            max_new_tokens=3000,
        )


class SceneStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_a_scene_added_to_a_story_that_has_scenes_leaves_every_reference_on_its_words(self) -> None:
        # The story's words so far: "The(0) ship(1) landed(2) on(3) Mars(4) at(5)
        # dawn.(6)", the scene of the landing, which the concept points into.
        arrival = SalientConceptCell("Arrival", [SalientConceptReference("r1", StoryWordRange(1, 4))], "", False, None, "k1")
        landing = PlotCell(
            "Arrival",
            [PlotNode("g1", StoryWordRange(0, 6), "0", "mars, the port", "The ship lands.")],
            [],
            "",
            False,
            None,
            "p0",
        )
        varn = PlotCell(
            "Motherhood",
            [PlotNode("e1", None, "1", "mars, the base", "Dax takes the water from Varn and her son.")],
            [],
            "",
            False,
            None,
            "p1",
        )
        dax = PlotCell(
            "Brutal father",
            [PlotNode("f1", None, "1", "mars, the base", "Dax takes the water from Varn and her son.")],
            [],
            "",
            False,
            None,
            "p2",
        )
        the_landing = MarkdownCell("The ship landed on Mars at dawn.", False, None, "s0")
        document = Document.from_cells([arrival, landing, varn, dax, the_landing])
        # The author accepts the scene shown.
        author = Mock()
        author.review = AsyncMock(return_value=Answer(ReviewResult.success(), ""))
        reviews = Review(0.0, random.Random(0), author)
        model = Mock()
        model.complete.return_value = streamed("Dax took the water while Varn held her son close.")
        where_they_meet = SceneStep(
            [
                PlotNode("e1", None, "1", "mars, the base", "Dax takes the water from Varn and her son."),
                PlotNode("f1", None, "1", "mars, the base", "Dax takes the water from Varn and her son."),
            ],
            model,
        )

        _, with_the_meeting = await where_they_meet(document, reviews, "")

        story_words = StoryWordsIterator(with_the_meeting)
        (concept,) = with_the_meeting.salient_concepts()
        (passage,) = concept.references
        landing_plot, varn_plot, dax_plot = with_the_meeting.plots()
        (ship_lands,) = landing_plot.nodes
        (meeting_of_varn,) = varn_plot.nodes
        (meeting_of_dax,) = dax_plot.nodes
        self.assertEqual(story_words.text(passage.story_word_range), "ship landed on Mars")
        self.assertEqual(story_words.text(ship_lands.story_word_range), "The ship landed on Mars at dawn.")
        self.assertEqual(story_words.text(meeting_of_varn.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(meeting_of_dax.story_word_range), "Dax took the water while Varn held her son close.")
