import unittest
from typing import Any

from authordoc.cells.plot_cell import PLOT
from authordoc.cells.salient_concept_cell import SALIENT_CONCEPT
from parameterized import parameterized
from server.story_generator.review import CommandShown, EditorShown, Shown, TabShown


class ShownWritten(unittest.TestCase):
    @parameterized.expand(
        [
            ("tab", TabShown(PLOT), {"kind": "tab", "cellKind": "plot"}),
            (
                "command",
                CommandShown(SALIENT_CONCEPT, "addStoryAnnotation"),
                {"kind": "command", "cellKind": "salient-concept", "commandName": "addStoryAnnotation"},
            ),
            ("editor", EditorShown(), {"kind": "editor"}),
        ]
    )
    def test_as_the_editor_reads_it(self, _, shown: Shown, expected: dict[str, Any]) -> None:
        self.assertEqual(shown.written(), expected)
