import unittest

from parameterized import parameterized  # type: ignore

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
            [
                section.line_ranges_in_manuscript
                for section in Manuscript(document).sections
            ],
            expected,
        )

    @parameterized.expand(
        [
            (
                "one section",
                MANUSCRIPT_1,
                [
                    ["Text in section 1", "Another line in section 1"],
                ],
            ),
            (
                "one section, notes throughout",
                MANUSCRIPT_2,
                [
                    ["Text in section 1", "Another line in section 1"],
                ],
            ),
            (
                "two sections",
                MANUSCRIPT_3,
                [
                    ["Text in section 1", "Another line in section 1"],
                    [
                        "Text in section 2",
                        "More text in section 2",
                        "and even more text in section 2",
                    ],
                ],
            ),
        ]
    )
    def test_the_text_each_section_holds(
        self, _name: str, document: str, expected: list[list[str]]
    ) -> None:
        self.assertEqual(
            [
                story
                for section in Manuscript(document).sections
                if (story := list(section.lines))
            ],
            expected,
        )

    @parameterized.expand(
        [
            (MANUSCRIPT_1,),
            (MANUSCRIPT_2,),
            (MANUSCRIPT_3,),
        ]
    )
    def test_saving_manuscript_doesnt_change_it(self, document):
        manuscript = Manuscript(document)
        serialized_manuscript = str(manuscript)
        self.assertEqual(document, serialized_manuscript)

    @parameterized.expand(
            [
                (MANUSCRIPT_1, 5, 5, "Modified text in section 1",
                 """
# Title 1

## Section 1

Modified text in section 1
Another line in section 1
"""
                 ),
                (MANUSCRIPT_2, 4, 9, "Something\nWicked\nThis\nWay\nComes",
"""
# Title 1
<!-- comment -->
## Section 1
Something
Wicked
This
Way
Comes
Another line in section 1
"""),
            ]
        )
    def test_modify_section_text(self, document, mod_start_line, mod_end_line, mod_text, expected):
        manuscript = Manuscript(document)
        manuscript.delete(mod_start_line, mod_end_line)
        manuscript.insert(mod_start_line, mod_text)

        serialized_manuscript = str(manuscript)
        self.assertEqual(expected, serialized_manuscript)

    def test_deleting_a_comment_changes_the_lines_its_section_holds(self):
        manuscript = Manuscript(MANUSCRIPT_2)
        self.assertEqual(
            manuscript.sections[1].line_ranges_in_manuscript, [(4, 5), (10, 10)]
        )

        manuscript.delete(6, 9)

        self.assertEqual(
            [section.title for section in manuscript.sections],
            ["First anonymous section", "Section 1"],
        )
        self.assertEqual(manuscript.sections[1].line_ranges_in_manuscript, [(4, 6)])
        self.assertEqual(
            str(manuscript),
            "\n# Title 1\n<!-- comment -->\n## Section 1\n\n"
            "Text in section 1\nAnother line in section 1\n",
        )

    def test_retrieving_references_from_section(self):
        manuscript = Manuscript(MANUSCRIPT_2)
        section = manuscript.sections[0]

        self.assertEqual(section.reference(line=0, phrase="Text in section 1"), (0, 20))



if __name__ == "__main__":
    unittest.main()
