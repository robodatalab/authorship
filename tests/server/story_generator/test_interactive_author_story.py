import unittest

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
