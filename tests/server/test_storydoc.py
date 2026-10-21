import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

from parameterized import parameterized

from server.storydoc import storydoc
from server.storydoc.parser import parse
from server.storydoc.iterators.chapters_iterator import ChaptersIterator
from server.storydoc.iterators.prose_cells_iterator import ProseCellsIterator
from server.storydoc.iterators.story_lines_iterator import StoryLinesIterator
from server.storydoc.iterators.story_words_iterator import StoryWordsIterator
from server.storydoc.storydoc import Document
from server.storydoc.cells.blurb_cell import BlurbCell
from server.storydoc.cells.chapter_cell import ChapterCell
from server.storydoc.cells.divider_cell import DIVIDER, DividerCell
from server.storydoc.cells.image_cell import ImageCell
from server.storydoc.cells.markdown_cell import MarkdownCell
from server.storydoc.cells.note_cell import NoteCell
from server.storydoc.cells.part_cell import PartCell
from server.storydoc.cells.plot_cell import PlotCell, PlotEdge, PlotNode
from server.storydoc.cells.recap_cell import RecapCell
from server.storydoc.cells.salient_concept_cell import (
    SalientConceptCell,
    SalientConceptReference,
)
from server.storydoc.cells.story_word_range import StoryWordRange
from server.storydoc.cells.table_of_contents_cell import TableOfContentsCell
from server.storydoc.cells.title_page_cell import TitlePageCell

CORPUS = json.loads(
    (Path(__file__).parents[1] / "storydoc_corpus.json").read_text(encoding="utf-8")
)


class StoryLines(unittest.TestCase):
    def build_document(self) -> Document:
        return Document.from_cells(
                [
                    TitlePageCell("Veriona"),
                    ChapterCell("The First Night"),
                    MarkdownCell(
                        "The lantern had gone out.\n"
                        "<!-- ask Mara whether this is the third time -->\n"
                        "She did not light it."
                    ),
                    NoteCell("Remember the lantern."),
                    BlurbCell("A woman loses her name."),
                    RecapCell("", "What happened before."),
                    TableOfContentsCell("1. The First Night"),
                    MarkdownCell("The door stood open."),
                ]
            )

    def test_are_the_prose_of_the_markdown_cells_and_nothing_else(self) -> None:
        said = [line for _, line in StoryLinesIterator(self.build_document())]

        self.assertEqual(
            said,
            [
                "The lantern had gone out.",
                "She did not light it.",
                "The door stood open.",
            ],
        )

    def test_say_which_line_of_the_document_each_is_written_on(self) -> None:
        document = self.build_document()

        for index, said in StoryLinesIterator(document):
            self.assertEqual(document.lines[index], said)

    def test_can_be_asked_for_one_stretch_of_the_document(self) -> None:
        document = self.build_document()
        lantern = document.cells[2]
        assert lantern.at is not None

        self.assertEqual(
            [line for _, line in StoryLinesIterator(document, *lantern.at)],
            ["The lantern had gone out.", "She did not light it."],
        )


class Corpus(unittest.TestCase):
    def test_every_document_reads_as_the_corpus_says(self) -> None:
        # The same file drives the TypeScript tests, so a rule added in one
        # language cannot quietly go unimplemented in the other.
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                expected = [(c["kind"], c["source"], c["id"]) for c in case["cells"]]
                parsed = [
                    (cell.kind, cell.source, cell.unique_id)
                    for cell in parse(case["text"])
                ]
                self.assertEqual(parsed, expected)

    def test_every_document_is_written_back_byte_for_byte(self) -> None:
        # Round-tripping through this library alone would let the two
        # implementations drift apart while both stayed self-consistent, so the
        # corpus pins the bytes rather than the behaviour.
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                written = Document(case["text"]).text
                self.assertEqual(written, case["dumped"])

    def test_every_document_survives_a_round_trip(self) -> None:
        for case in CORPUS["cases"]:
            with self.subTest(case=case["name"]):
                cells = parse(case["text"])
                self.assertEqual(Document.from_cells(cells).cells, cells)


class Writing(unittest.TestCase):
    def test_a_cell_is_written_as_a_marker_and_its_text(self) -> None:
        written = Document.from_cells([MarkdownCell("Prose.", False, None, "m1")]).text
        self.assertEqual(written, '<!-- cell: markdown id="m1" -->\n\nProse.\n')

    def test_a_chapter_is_written_as_its_marker_alone(self) -> None:
        # A chapter names a place in the book; the prose under it is its own cell.
        written = Document.from_cells([ChapterCell("One", "", False, None, "c1")]).text
        self.assertEqual(written, '<!-- cell: chapter id="c1" title="One" -->\n')

    def test_a_part_is_written_as_its_marker_alone(self) -> None:
        # A part names a division of the story; the chapters under it are their
        # own cells, exactly as the prose under a chapter is.
        written = Document.from_cells([PartCell("Book One", "", False, None, "p1")]).text
        self.assertEqual(written, '<!-- cell: part id="p1" title="Book One" -->\n')

    def test_a_divider_is_written_as_its_marker_alone(self) -> None:
        # Where the author cuts the files, and nothing the reader ever meets.
        self.assertEqual(
            Document.from_cells([DividerCell("", False, None, "d1")]).text,
            '<!-- cell: divider id="d1" -->\n',
        )

    def test_a_divider_survives_the_round_trip(self) -> None:
        back = Document.from_cells([DividerCell()]).cells
        self.assertEqual(back[0].kind, DIVIDER)

    def test_a_cell_with_no_text_is_written_as_its_marker_alone(self) -> None:
        self.assertEqual(
            Document.from_cells([TableOfContentsCell("", False, None, "t1")]).text,
            '<!-- cell: contents id="t1" -->\n',
        )

    def test_an_unknown_kind_is_written_back_as_it_was_read(self) -> None:
        text = '<!-- cell: epigraph id="e1" attribution="Anon" -->\n\nA line.\n'
        self.assertEqual(Document(text).text, text)

    def test_a_quote_in_an_attribute_is_escaped_on_the_way_out(self) -> None:
        written = Document.from_cells([ChapterCell('She said "no"')]).text
        self.assertIn('title="She said \\"no\\""', written)


class Asking(unittest.TestCase):
    def test_a_document_says_which_of_its_cells_are_prose(self) -> None:
        document = Document.from_cells(
                [
                    ChapterCell("One"),
                    MarkdownCell("The lantern had gone out."),
                    TableOfContentsCell(),
                    MarkdownCell("The door stood open."),
                ]
            )

        self.assertEqual(
            [cell.source for cell in ProseCellsIterator(document)],
            ["The lantern had gone out.", "The door stood open."],
        )

    def test_a_document_with_no_title_page_says_it_is_anonymous(self) -> None:
        document = Document.from_cells([ChapterCell("One")])

        self.assertEqual(document.title_page.title, "")
        self.assertEqual(document.title, "Anonymous")


class Chapters(unittest.TestCase):
    def test_each_chapter_carries_the_prose_written_under_it(self) -> None:
        document = Document.from_cells(
                [
                    ChapterCell("One"),
                    MarkdownCell("The door stood open."),
                    ChapterCell("Two"),
                    MarkdownCell("It closed."),
                ]
            )
        self.assertEqual(
            [
                (title, chapter_lines.text())
                for title, chapter_lines in ChaptersIterator(document)
            ],
            [("One", "The door stood open."), ("Two", "It closed.")],
        )

    def test_a_part_divides_the_chapters_without_being_one(self) -> None:
        # A part names a run of chapters and carries no prose, so it is neither a
        # chapter of its own nor something falling into the one before it.
        document = Document.from_cells(
                [
                    PartCell("Day One"),
                    ChapterCell("One"),
                    MarkdownCell("The door stood open."),
                    PartCell("Day Two"),
                    ChapterCell("Two"),
                    MarkdownCell("It closed."),
                ]
            )
        self.assertEqual(
            [
                (title, chapter_lines.text())
                for title, chapter_lines in ChaptersIterator(document)
            ],
            [("One", "The door stood open."), ("Two", "It closed.")],
        )


class OnDisk(unittest.TestCase):
    def test_a_document_survives_being_saved_and_loaded(self) -> None:
        cells = [ImageCell("c.jpg"), ChapterCell("One")]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / f"story{storydoc.EXTENSION}"
            Document.from_cells(cells, path).save()
            self.assertEqual(Document.load(path).cells, cells)


if __name__ == "__main__":
    unittest.main()


class SalientConcepts(unittest.TestCase):
    @parameterized.expand([
        (
            "no_concepts",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n',
            [],
        ),
        (
            "a_concept_without_word_ranges",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" -->\n'
            '\n'
            'What she saw.\n',
            [SalientConceptCell("Door", [], "What she saw.", False, None, "k1")],
        ),
        (
            "a_range_within_a_cell",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-3" -->\n'
            '\n'
            'What she saw.\n',
            [SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(2, 3))], "What she saw.", False, None, "k1")],
        ),
        (
            "a_range_of_one_word",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Her" words="r1:0-0" -->\n',
            [SalientConceptCell("Her", [SalientConceptReference("r1", StoryWordRange(0, 0))], "", False, None, "k1")],
        ),
        (
            "a_range_across_paragraphs_of_a_cell",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            'He heard the bell.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Arrival" words="r1:2-5" -->\n',
            [SalientConceptCell("Arrival", [SalientConceptReference("r1", StoryWordRange(2, 5))], "", False, None, "k1")],
        ),
        (
            "a_range_across_markdown_cells",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'He heard the bell.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Arrival" words="r1:3-5" -->\n',
            [SalientConceptCell("Arrival", [SalientConceptReference("r1", StoryWordRange(3, 5))], "", False, None, "k1")],
        ),
        (
            "cells_other_than_markdown_hold_no_story_words",
            '<!-- cell: chapter title="One Night" -->\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: note -->\n'
            '\n'
            'Not a story word.\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'He heard the bell.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Him" words="r1:4-4" -->\n'
            '\n'
            'The one who heard.\n',
            [SalientConceptCell("Him", [SalientConceptReference("r1", StoryWordRange(4, 4))], "The one who heard.", False, None, "k1")],
        ),
        (
            "a_run_without_a_letter_or_a_digit_is_not_a_word",
            '<!-- cell: markdown -->\n'
            '\n'
            'She — saw 2 doors.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Seeing" words="r1:0-2" -->\n',
            [SalientConceptCell("Seeing", [SalientConceptReference("r1", StoryWordRange(0, 2))], "", False, None, "k1")],
        ),
        (
            "a_run_of_letters_outside_ascii_alone_is_not_a_word",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw é café.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Café" words="r1:2-2" -->\n',
            [SalientConceptCell("Café", [SalientConceptReference("r1", StoryWordRange(2, 2))], "", False, None, "k1")],
        ),
        (
            "the_words_of_a_comment_in_a_markdown_cell_are_story_words",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw <!-- a note --> the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:4-5" -->\n',
            [SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(4, 5))], "", False, None, "k1")],
        ),
        (
            "ranges_keep_the_order_they_are_written_in",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-3, r2:0-1" -->\n',
            [
                SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(2, 3)), SalientConceptReference("r2", StoryWordRange(0, 1))], "", False, None, "k1")
            ],
        ),
        (
            "ranges_written_wrong_are_skipped",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-3, x, 5-, -1, r2:0-0" -->\n',
            [
                SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(2, 3)), SalientConceptReference("r2", StoryWordRange(0, 0))], "", False, None, "k1")
            ],
        ),
        (
            "a_range_past_the_end_of_the_story_covers_no_text",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:10-12" -->\n',
            [SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(10, 12))], "", False, None, "k1")],
        ),
        (
            "a_range_running_past_the_end_covers_the_words_up_to_the_end",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-12" -->\n',
            [SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(2, 12))], "", False, None, "k1")],
        ),
        (
            "several_concepts_in_the_order_of_the_document",
            '<!-- cell: salient-concept id="k1" title="Bell" words="r1:6-7" -->\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'He heard the bell.\n'
            '\n'
            '<!-- cell: salient-concept id="k2" title="Door" words="r1:2-3" -->\n',
            [
                SalientConceptCell("Bell", [SalientConceptReference("r1", StoryWordRange(6, 7))], "", False, None, "k1"),
                SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(2, 3))], "", False, None, "k2"),
            ],
        ),
        (
            "concepts_may_share_words",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-3" -->\n'
            '\n'
            '<!-- cell: salient-concept id="k2" title="Seeing" words="r1:0-3" -->\n',
            [
                SalientConceptCell("Door", [SalientConceptReference("r1", StoryWordRange(2, 3))], "", False, None, "k1"),
                SalientConceptCell("Seeing", [SalientConceptReference("r1", StoryWordRange(0, 3))], "", False, None, "k2"),
            ],
        ),
    ])
    def test_are_read_with_the_story_text_their_word_ranges_cover(
        self, _, text: str, expected: list[SalientConceptCell]
    ) -> None:
        document = Document(text)

        salient_concepts = document.salient_concepts()

        self.assertEqual(salient_concepts, expected)

    @patch("server.storydoc.parser.uuid4", return_value=UUID("3f1c0e2a-0000-4000-8000-000000000001"))
    def test_a_reference_written_without_an_id_is_given_one(self, _uuid4) -> None:
        document = Document(
            '<!-- cell: markdown id="m1" -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: salient-concept id="k1" title="Door" words="2-3" -->\n'
        )

        salient_concepts = document.salient_concepts()

        self.assertEqual(
            salient_concepts,
            [
                SalientConceptCell("Door", [
                        SalientConceptReference("3f1c0e2a-0000-4000-8000-000000000001", StoryWordRange(2, 3)),
                    ], "", False, None, "k1")
            ],
        )

    def test_are_written_with_the_ids_of_their_references(self) -> None:
        written = Document.from_cells([
            SalientConceptCell("Door", [
                    SalientConceptReference("r1", StoryWordRange(2, 3)),
                    SalientConceptReference("r2", StoryWordRange(0, 1)),
                ], "", False, None, "k1")
        ]).text

        self.assertEqual(written, '<!-- cell: salient-concept id="k1" title="Door" words="r1:2-3, r2:0-1" -->\n')


class Plots(unittest.TestCase):
    @parameterized.expand([
        (
            "no_plots",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n',
            [],
        ),
        (
            "a_plot_without_nodes_or_edges",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: plot id="k1" title="The door" -->\n'
            '\n'
            'She finds the door.\n',
            [PlotCell("The door", [], [], "She finds the door.", False, None, "k1")],
        ),
        (
            "nodes_in_the_order_they_are_written",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'He heard the bell.\n'
            '\n'
            '<!-- cell: plot id="k1" title="The bell" nodes="n-bell:6-7, n-door:2-3" -->\n'
            '\n'
            'He hears the bell.\n',
            [
                PlotCell("The bell", [
                        PlotNode("n-bell", StoryWordRange(6, 7)),
                        PlotNode("n-door", StoryWordRange(2, 3)),
                    ], [], "He hears the bell.", False, None, "k1")
            ],
        ),
        (
            "edges_from_one_node_to_another",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: plot id="k1" title="Seeing" nodes="n-she:0-0, n-saw:1-1, n-door:2-3" '
            'edges="e-1:n-she>n-saw, e-2:n-she>n-door, e-3:n-saw>n-door" -->\n',
            [
                PlotCell("Seeing", [
                        PlotNode("n-she", StoryWordRange(0, 0)),
                        PlotNode("n-saw", StoryWordRange(1, 1)),
                        PlotNode("n-door", StoryWordRange(2, 3)),
                    ], [
                        PlotEdge("e-1", "n-she", "n-saw"),
                        PlotEdge("e-2", "n-she", "n-door"),
                        PlotEdge("e-3", "n-saw", "n-door"),
                    ], "", False, None, "k1")
            ],
        ),
        (
            "entries_that_are_not_nodes_or_edges_are_left_out",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: plot id="k1" title="Seeing" nodes="n-she:0-0, 2-3" edges="e-1:n-she, e-2:n-she>n-she" -->\n',
            [
                PlotCell("Seeing", [PlotNode("n-she", StoryWordRange(0, 0))], [PlotEdge("e-2", "n-she", "n-she")], "", False, None, "k1")
            ],
        ),
    ])
    def test_are_read_with_their_nodes_and_edges(
        self, _, text: str, expected: list[PlotCell]
    ) -> None:
        document = Document(text)

        plots = document.plots()

        self.assertEqual(plots, expected)


class StoryText(unittest.TestCase):
    @parameterized.expand([
        (
            "a_range_within_a_cell",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n',
            2,
            3,
            "the door.",
        ),
        (
            "a_range_of_one_word",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n',
            0,
            0,
            "She",
        ),
        (
            "a_range_across_paragraphs_of_a_cell",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            'He heard the bell.\n',
            2,
            5,
            "the door.\n\nHe heard",
        ),
        (
            "a_range_across_markdown_cells",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'He heard the bell.\n',
            3,
            5,
            "door.\n\nHe heard",
        ),
        (
            "cells_other_than_markdown_hold_no_story_words",
            '<!-- cell: chapter title="One Night" -->\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n'
            '\n'
            '<!-- cell: note -->\n'
            '\n'
            'Not a story word.\n'
            '\n'
            '<!-- cell: markdown -->\n'
            '\n'
            'He heard the bell.\n',
            4,
            4,
            "He",
        ),
        (
            "a_run_without_a_letter_or_a_digit_is_not_a_word",
            '<!-- cell: markdown -->\n'
            '\n'
            'She — saw 2 doors.\n',
            0,
            2,
            "She — saw 2",
        ),
        (
            "a_run_of_letters_outside_ascii_alone_is_not_a_word",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw é café.\n',
            2,
            2,
            "café.",
        ),
        (
            "the_words_of_a_comment_in_a_markdown_cell_are_story_words",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw <!-- a note --> the door.\n',
            4,
            5,
            "the door.",
        ),
        (
            "a_range_starting_past_the_end_covers_nothing",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n',
            10,
            12,
            "",
        ),
        (
            "a_range_running_past_the_end_covers_the_words_up_to_the_end",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door.\n',
            2,
            12,
            "the door.",
        ),
    ])
    def test_is_the_text_the_story_words_cover(
        self, _, text: str, start_word_idx: int, end_word_idx: int, expected: str
    ) -> None:
        document = Document(text)
        story_words = StoryWordsIterator(document)
        story_word_range = StoryWordRange(start_word_idx, end_word_idx)

        story_text = story_words.text(story_word_range)

        self.assertEqual(story_text, expected)
