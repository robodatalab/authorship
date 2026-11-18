import unittest
from collections.abc import AsyncIterator
from unittest.mock import Mock, call

from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.place_cell import PlaceCell
from authordoc.cells.plot_cell import PlotCell, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell, SalientConceptReference
from authordoc.cells.story_word_range import StoryWordRange
from authordoc.iterators.story_words_iterator import StoryWordsIterator
from authordoc.storydoc import Document
from cortexgrid_infer import CompletionChunk
from server.story_generator.interactive_author_story import InteractiveAuthorStory
from server.story_generator.secondary_characters import SECONDARY_CHARACTER_INSTRUCTIONS
from server.story_generator.stages.scenes import NAMES_INSTRUCTIONS, SCENE_INSTRUCTIONS, Scenes, SceneStep


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


class ScenesRun(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        varn = PlotCell(
            "Motherhood",
            [
                PlotNode("e1", None, "1", "b1", [], "Dax takes the water from Varn and her son."),
                PlotNode("e2", None, "2", "r1", [], "Varn shares her water with her son."),
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
                PlotNode("f1", None, "1", "b1", [], "Dax takes the water from Varn and her son."),
                PlotNode("f2", None, "2.5", "b1", [], "Dax drinks in front of the thirsty."),
            ],
            [],
            "",
            False,
            None,
            "p2",
        )
        the_base = PlaceCell("mars, the base", "", False, None, "b1")
        varns_room = PlaceCell("mars, Varn's room", "", False, None, "r1")
        self.document = Document.from_cells([the_base, varns_room, varn, dax])
        self.model = Mock()
        self.deployment = Mock()
        self.deployment.client_async.return_value = self.model
        self.model.complete.side_effect = [
            streamed("Dax took the water while Varn held her son close."),
            streamed(""),
            streamed("Varn gave her son the last cup.\n\nHe drank it slowly."),
            streamed(""),
            streamed("Dax drank in front of them."),
            streamed(""),
        ]

    async def test_every_event_points_at_the_whole_of_its_scene(self) -> None:
        where_they_meet, in_varns_room, where_dax_drinks = Scenes(self.deployment).run(self.document)
        with_the_meeting = await where_they_meet(self.document)
        with_varns_room = await in_varns_room(with_the_meeting)
        with_every_scene = await where_dax_drinks(with_varns_room)

        story_words = StoryWordsIterator(with_every_scene)
        varn, dax = with_every_scene.plots()
        meeting_of_varn, varns_room = varn.nodes
        meeting_of_dax, dax_drinks = dax.nodes
        self.assertEqual(story_words.text(meeting_of_varn.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(meeting_of_dax.story_word_range), "Dax took the water while Varn held her son close.")
        self.assertEqual(story_words.text(varns_room.story_word_range), "Varn gave her son the last cup.\n\nHe drank it slowly.")
        self.assertEqual(story_words.text(dax_drinks.story_word_range), "Dax drank in front of them.")

    async def test_every_event_keeps_pointing_at_its_scene_when_a_scene_before_it_grows(self) -> None:
        where_they_meet, in_varns_room, where_dax_drinks = Scenes(self.deployment).run(self.document)
        with_the_meeting = await where_they_meet(self.document)
        with_varns_room = await in_varns_room(with_the_meeting)
        with_every_scene = await where_dax_drinks(with_varns_room)
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

    async def test_asks_for_the_scene_once_where_events_intersect(self) -> None:
        where_they_meet, _, _ = Scenes(self.deployment).run(self.document)
        await where_they_meet(self.document)

        self.model.complete.assert_any_call(
            [
                {"role": "system", "content": SCENE_INSTRUCTIONS},
                {"role": "user", "content": "Where: mars, the base\nWho: no one named\n\nWhat happens:\nDax takes the water from Varn and her son."},
            ],
        )


class SceneStepCall(unittest.IsolatedAsyncioTestCase):
    async def test_a_scene_added_to_a_story_that_has_scenes_leaves_every_reference_on_its_words(self) -> None:
        # The story's words so far: "The(0) ship(1) landed(2) on(3) Mars(4) at(5)
        # dawn.(6)", the scene of the landing, which the concept points into.
        arrival = SalientConceptCell("Arrival", [SalientConceptReference("r1", StoryWordRange(1, 4))], "", False, None, "k1")
        landing = PlotCell(
            "Arrival",
            [PlotNode("g1", StoryWordRange(0, 6), "0", "t1", [], "The ship lands.")],
            [],
            "",
            False,
            None,
            "p0",
        )
        varn = PlotCell(
            "Motherhood",
            [PlotNode("e1", None, "1", "b1", [], "Dax takes the water from Varn and her son.")],
            [],
            "",
            False,
            None,
            "p1",
        )
        dax = PlotCell(
            "Brutal father",
            [PlotNode("f1", None, "1", "b1", [], "Dax takes the water from Varn and her son.")],
            [],
            "",
            False,
            None,
            "p2",
        )
        the_landing = MarkdownCell("The ship landed on Mars at dawn.", False, None, "s0")
        document = Document.from_cells([arrival, landing, varn, dax, the_landing])
        model = Mock()
        model.complete.side_effect = [streamed("Dax took the water while Varn held her son close."), streamed("")]
        where_they_meet = SceneStep(
            [
                PlotNode("e1", None, "1", "b1", [], "Dax takes the water from Varn and her son."),
                PlotNode("f1", None, "1", "b1", [], "Dax takes the water from Varn and her son."),
            ],
            model,
        )

        with_the_meeting = await where_they_meet(document)

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


class SceneStepCharacters(unittest.IsolatedAsyncioTestCase):
    async def test_every_event_takes_part_with_the_characters_the_scene_names(self) -> None:
        varn = CharacterCell("Varn", "A captain.", False, None, "v1")
        dax = CharacterCell("Dax", "An officer.", False, None, "x1")
        meeting = PlotNode("e1", None, "1", "", ["v1"], "Dax takes the water from Varn.")
        document = Document.from_cells([varn, dax, PlotCell("Motherhood", [meeting], [], "", False, None, "p1")])
        model = Mock()
        model.complete.side_effect = [
            streamed("Dax took the water while Varn held her son, and the quartermaster Ilse looked away."),
            streamed("Dax\nVarn\nIlse"),
            streamed("The base's quartermaster, who keeps the water log."),
        ]

        told = await SceneStep([meeting], model)(document)

        ilse = InteractiveAuthorStory(told).character_named("Ilse")
        (plot,) = told.plots()
        (meeting_told,) = plot.nodes
        self.assertEqual(
            (meeting_told.characters(told), ilse.source),
            ([varn, dax, ilse], "The base's quartermaster, who keeps the water log."),
        )
        self.assertEqual(
            model.complete.call_args_list[1:],
            [
                call(
                    [
                        {"role": "system", "content": NAMES_INSTRUCTIONS},
                        {"role": "user", "content": "Dax took the water while Varn held her son, and the quartermaster Ilse looked away."},
                    ]
                ),
                call(
                    [
                        {"role": "system", "content": SECONDARY_CHARACTER_INSTRUCTIONS},
                        {
                            "role": "user",
                            "content": "The character: Ilse\n\nThe scene:\nDax took the water while Varn held her son, and the quartermaster Ilse looked away.",
                        },
                    ]
                ),
            ],
        )
