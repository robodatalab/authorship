import unittest

from server.publishing import tools


class Blocks(unittest.TestCase):
    def test_every_line_is_its_own_paragraph(self) -> None:
        self.assertEqual(
            tools.blocks_to_xhtml(["one", "two", "", "three"]),
            "<p>one</p>\n<p>two</p>\n<p>three</p>",
        )

    def test_a_heading_written_in_the_prose_stands_under_the_section_title(
        self,
    ) -> None:
        self.assertEqual(tools.blocks_to_xhtml(["# Title"]), "<h3>Title</h3>")
        self.assertEqual(tools.blocks_to_xhtml(["## Two"]), "<h4>Two</h4>")
        self.assertEqual(tools.blocks_to_xhtml(["### Three"]), "<h5>Three</h5>")

    def test_a_heading_carries_the_formatting_written_into_it(self) -> None:
        self.assertEqual(
            tools.blocks_to_xhtml(["## The *Queendom* at war"]),
            "<h4>The <em>Queendom</em> at war</h4>",
        )

    def test_a_rule_of_three_or_more_is_a_scene_break(self) -> None:
        for rule in ["---", "***", "___", "----"]:
            with self.subTest(rule=rule):
                self.assertIn(
                    '<hr class="scene-break"/>',
                    tools.blocks_to_xhtml(["a", "", rule, "", "b"]),
                )


if __name__ == "__main__":
    unittest.main()
