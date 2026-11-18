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
            ("the_name_of_its_place", "b1", "mars, the base"),
            ("nothing_for_an_event_in_no_place", "", ""),
            ("nothing_for_a_place_the_story_does_not_have", "x9", ""),
        ]
    )
    def test_name_the_place_of_an_event(self, _, place_id: str, expected_name: str) -> None:
        document = Document.from_cells([PlaceCell("mars, the base", "", False, None, "b1")])
        event = PlotNode("e1", None, "1", place_id, [], "Varn waits.")

        place_name = InteractiveAuthorStory(document).place_name_of(event)

        self.assertEqual(place_name, expected_name)

    def test_give_the_place_the_story_has_by_the_name(self) -> None:
        the_base = PlaceCell("mars, the base", "", False, None, "b1")
        varns_room = PlaceCell("mars, Varn's room", "", False, None, "r1")
        document = Document.from_cells([the_base, varns_room])

        story, place = InteractiveAuthorStory(document).with_place_named("mars, Varn's room")

        self.assertEqual(place, varns_room)
        self.assertEqual(story.document.cells, [the_base, varns_room])

    def test_add_a_place_by_a_name_the_story_has_none_by(self) -> None:
        the_base = PlaceCell("mars, the base", "", False, None, "b1")
        document = Document.from_cells([the_base])

        story, place = InteractiveAuthorStory(document).with_place_named("mars, the dunes")

        self.assertEqual(place.title, "mars, the dunes")
        self.assertEqual(story.document.cells, [the_base, place])
