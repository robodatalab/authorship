import unittest

from authordoc.storydoc import Document
from server.story_generator.stages.cast import Cast


class CastStage(unittest.TestCase):
    def test_does_no_work_of_its_own(self) -> None:
        steps = Cast().run(Document.from_cells([]))

        self.assertEqual(steps, [])
