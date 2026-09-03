"""Tests for writing the story so far out of the volumes before this one.

Every chapter is read in a turn of its own and the summary is folded forward
from one turn to the next. What is under test is that nothing written is
missed: every document handed over is parsed, and every markdown section under
every one of its chapters reaches the model.
"""

import unittest
from unittest import mock

from parameterized import parameterized  # type: ignore

from server import storydoc
from server.storydoc import Document
from server.writing_tools.recap import write_recap


def volume(title: str, chapters: list[tuple[str, list[str]]]) -> Document:
    """A book with those chapters, each written in the markdown cells given."""
    cells = [storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": title})]
    for name, sections in chapters:
        cells.append(storydoc.chapter(name))
        cells.extend(storydoc.markdown(section) for section in sections)
    return Document(storydoc.dumps(cells))


ONE_VOLUME_ONE_CHAPTER = [
    (
        "Veriona",
        [("The First Night", ["The lantern had gone out again."])],
    ),
]

ONE_VOLUME_TWO_CHAPTERS = [
    (
        "Veriona",
        [
            (
                "The First Night",
                ["The lantern had gone out again.", "She did not light it."],
            ),
            ("The Second", ["The door stood open."]),
        ],
    ),
]

TWO_VOLUMES = [
    (
        "Veriona",
        [
            ("The First Night", ["The lantern had gone out again."]),
            ("The Second", ["The door stood open.", "Nobody had come through it."]),
        ],
    ),
    (
        "Veriona II",
        [
            ("The Road", ["She walked until the road ended."]),
            ("The Water", ["The river was louder here."]),
            ("The Name", ["She had lost it somewhere behind her."]),
        ],
    ),
]


class WriteRecap(unittest.TestCase):
    @parameterized.expand(
        [
            ("one volume of one chapter", ONE_VOLUME_ONE_CHAPTER),
            ("one volume of two chapters", ONE_VOLUME_TWO_CHAPTERS),
            ("two volumes", TWO_VOLUMES),
        ]
    )
    def test_every_markdown_section_of_every_document_is_read(
        self, _name: str, books: list[tuple[str, list[tuple[str, list[str]]]]]
    ) -> None:
        model = mock.MagicMock()
        model.complete.return_value = "The story so far."

        write_recap(model, [volume(title, chapters) for title, chapters in books])

        read = [call.args[1] for call in model.complete.call_args_list]
        chapters = [chapter for _, chapters in books for chapter in chapters]
        # A turn for each chapter of each volume, in the order they were handed
        # over, and everything written under a chapter reaches its turn.
        self.assertEqual(len(read), len(chapters))
        for said, (_, sections) in zip(read, chapters):
            for section in sections:
                self.assertIn(section, said)


if __name__ == "__main__":
    unittest.main()
