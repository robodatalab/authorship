import unittest

from authordoc.cells.character_cell import CHARACTER
from authordoc.storydoc import Document
from server.story_generator.review import CommandShown
from server.story_generator.stages.cast import Cast


class CastStage(unittest.TestCase):
    def test_does_no_work_of_its_own(self) -> None:
        steps = Cast().run(Document.from_cells([]))

        self.assertEqual(steps, [])

    def test_asks_the_author_to_add_the_characters(self) -> None:
        shown = Cast().shown()

        self.assertEqual(shown, CommandShown(CHARACTER, "insertCell"))
