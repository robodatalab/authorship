import unittest

from parameterized import parameterized

from server.manuscript import Manuscript


MANUSCRIPT_1 = """
# Title 1

## Section 1

Text in section 1
Another line in section 1
"""

MANUSCRIPT_2 = """
# Title 1
<!-- comment -->
## Section 1

Text in section 1
<!--
another
comment
-->
Another line in section 1
"""

MANUSCRIPT_3 = """
## Section 1

Text in section 1
Another line in section 1

## Section 2
Text in section 2
More text in section 2
and even more text in section 2
"""


class ManuscriptTests(unittest.TestCase):

    @parameterized.expand(
        [
            ("a title", MANUSCRIPT_1, "Title 1"),
            ("a title with notes around it", MANUSCRIPT_2, "Title 1"),
            ("no title", MANUSCRIPT_3, "Anonymous"),
        ]
    )
    def test_the_manuscript_title(
        self, _name: str, document: str, expected: str
    ) -> None:
        self.assertEqual(Manuscript(document).title, expected)

    @parameterized.expand(
        [
            ("one section", MANUSCRIPT_1, ["First anonymous section", "Section 1"]),
            (
                "one section, notes throughout",
                MANUSCRIPT_2,
                ["First anonymous section", "Section 1"],
            ),
            (
                "two sections",
                MANUSCRIPT_3,
                ["First anonymous section", "Section 1", "Section 2"],
            ),
        ]
    )
    def test_the_section_titles(
        self, _name: str, document: str, expected: list[str]
    ) -> None:
        self.assertEqual(
            [section.title for section in Manuscript(document).sections], expected
        )

    @parameterized.expand(
        [
            ("one section", MANUSCRIPT_1, [[(0, 2)], [(4, 6)]]),
            # Line 2 is a note on its own, and lines 6 to 9 are a note spanning
            # several lines; both drop out, breaking the runs around them.
            ("one section, notes throughout", MANUSCRIPT_2, [[(0, 1)], [(4, 5), (10, 10)]]),
            ("two sections", MANUSCRIPT_3, [[(0, 0)], [(2, 5)], [(7, 9)]]),
        ]
    )
    def test_the_lines_each_section_holds(
        self, _name: str, document: str, expected: list[list[tuple[int, int]]]
    ) -> None:
        self.assertEqual(
            [section.lines for section in Manuscript(document).sections], expected
        )


if __name__ == "__main__":
    unittest.main()
