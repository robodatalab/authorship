import unittest

from authordoc.cells.place_cell import PlaceCell
from authordoc.cells.plot_cell import PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.storydoc import Document
from parameterized import parameterized
from server.story_generator.interactive_author_story import InteractiveAuthorStory


class InteractiveAuthorStoryWrittenConcepts(unittest.TestCase):
    @parameterized.expand(
        [
            ("no_concepts", [], "None yet."),
            (
                "a_concept_not_described_yet",
                [SalientConceptCell("Motherhood", [], "", False, None, "k1")],
                "### Motherhood\n",
            ),
            (
                "concepts_each_under_its_title",
                [
                    SalientConceptCell("Motherhood", [], "A mother's care.", False, None, "k1"),
                    SalientConceptCell("War", [], "A war.", False, None, "k2"),
                ],
                "### Motherhood\nA mother's care.\n\n### War\nA war.",
            ),
        ]
    )
    def test_writes_every_concept_under_its_title(self, _, cells: list, expected_written: str) -> None:
        document = Document.from_cells(cells)

        written = InteractiveAuthorStory(document).written_concepts()

        self.assertEqual(written, expected_written)


class InteractiveAuthorStoryPlaces(unittest.TestCase):
    @parameterized.expand(
        [
            ("every_place_it_is_in_from_the_broadest", "r1", "mars, the base, Varn's room"),
            ("the_place_alone_when_it_is_in_no_other", "m1", "mars"),
            ("nothing_for_an_event_in_no_place", "", ""),
            ("nothing_for_a_place_the_story_does_not_have", "x9", ""),
        ]
    )
    def test_name_the_place_of_an_event(self, _, place_id: str, expected_name: str) -> None:
        document = Document.from_cells(
            [
                PlaceCell("mars", "", False, None, "m1"),
                PlaceCell("the base", "", False, None, "b1", "m1"),
                PlaceCell("Varn's room", "", False, None, "r1", "b1"),
            ]
        )
        event = PlotNode("e1", None, "1", place_id, [], "Varn waits.")

        place_name = InteractiveAuthorStory(document).place_name_of(event)

        self.assertEqual(place_name, expected_name)

    def test_give_the_place_the_story_has_by_the_name_whatever_its_case(self) -> None:
        mars = PlaceCell("Mars", "", False, None, "m1")
        the_base = PlaceCell("the base", "", False, None, "b1", "m1")
        varns_room = PlaceCell("Varn's room", "", False, None, "r1", "m1")
        document = Document.from_cells([mars, the_base, varns_room])

        story, place = InteractiveAuthorStory(document).with_place_named("mars, Varn's room")

        self.assertEqual(place, varns_room)
        self.assertEqual(story.document.cells, [mars, the_base, varns_room])

    def test_add_a_place_by_a_name_the_story_has_none_by_within_the_place_around_it(self) -> None:
        mars = PlaceCell("mars", "", False, None, "m1")
        the_base = PlaceCell("the base", "", False, None, "b1", "m1")
        document = Document.from_cells([mars, the_base])

        story, place = InteractiveAuthorStory(document).with_place_named("mars, the dunes")

        self.assertEqual(
            [place.title, place.parent(story.document), story.document.cells],
            ["the dunes", mars, [mars, the_base, place]],
        )

    def test_nest_every_place_of_a_name_the_story_has_none_of(self) -> None:
        document = Document.from_cells([])

        story, place = InteractiveAuthorStory(document).with_place_named("mars, Tharsis Basin, habitat medical bay")

        mars, basin, medical_bay = story.document.cells
        self.assertEqual(
            [
                (mars.title, mars.parent(story.document)),
                (basin.title, basin.parent(story.document)),
                (medical_bay.title, medical_bay.parent(story.document)),
                place,
            ],
            [("mars", None), ("Tharsis Basin", mars), ("habitat medical bay", basin), medical_bay],
        )

    def test_tell_apart_places_of_the_same_name_in_different_places(self) -> None:
        earth = PlaceCell("earth", "", False, None, "e1")
        earths_kitchen = PlaceCell("kitchen", "", False, None, "k1", "e1")
        mars = PlaceCell("mars", "", False, None, "m1")
        document = Document.from_cells([earth, earths_kitchen, mars])

        story, place = InteractiveAuthorStory(document).with_place_named("mars, kitchen")

        self.assertEqual(
            [place.title, place.parent(story.document), story.document.cells],
            ["kitchen", mars, [earth, earths_kitchen, mars, place]],
        )
