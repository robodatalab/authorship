import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from parameterized import parameterized

from server.manuscript import Manuscript, split_comments


class SplitComments(unittest.TestCase):

    @parameterized.expand(
        [
            ("nothing at all", [], [], []),
            ("no notes", ["alpha", "beta", "gamma"], [0, 1, 2], [(0, 2)]),
            ("a blank line is not a note", ["alpha", "", "beta"], [0, 1, 2], [(0, 2)]),
            (
                "a line that is only a note",
                ["alpha", "<!-- cut this -->", "beta"],
                [0, 1, 2],
                [(0, 0), (2, 2)],
            ),
            (
                "a note beside prose keeps the line",
                ["alpha <!-- or not -->", "beta"],
                [0, 1],
                [(0, 1)],
            ),
            (
                "several notes on one line keep the line",
                ["a <!-- one --> b <!-- two --> c"],
                [0],
                [(0, 0)],
            ),
            (
                "prose after a note closes keeps the line",
                ["<!-- cut this -->real"],
                [0],
                [(0, 0)],
            ),
            (
                "a note spanning lines takes all of them",
                ["alpha", "<!-- not yet", "beta -->", "gamma"],
                [0, 1, 2, 3],
                [(0, 0), (3, 3)],
            ),
            (
                "a note never closed runs to the end",
                ["alpha", "<!-- from here", "beta"],
                [0, 1, 2],
                [(0, 0)],
            ),
            (
                "notes back to back break the run once",
                ["alpha", "<!-- one -->", "<!-- two -->", "beta"],
                [0, 1, 2, 3],
                [(0, 0), (3, 3)],
            ),
            ("a note opening the lines", ["<!-- cut -->", "alpha"], [0, 1], [(1, 1)]),
            ("a note closing the lines", ["alpha", "<!-- cut -->"], [0, 1], [(0, 0)]),
            ("nothing but notes", ["<!-- one -->", "<!-- two -->"], [0, 1], []),
            (
                "the ranges are the indices given, not the positions",
                ["alpha", "<!-- cut -->", "beta"],
                [7, 8, 9],
                [(7, 7), (9, 9)],
            ),
        ]
    )
    def test_ranges(
        self,
        _name: str,
        lines: list[str],
        line_indices: list[int],
        expected: list[tuple[int, int]],
    ) -> None:
        self.assertEqual(split_comments(lines, line_indices), expected)


class ManuscriptTitle(unittest.TestCase):

    @parameterized.expand(
        [
            ("no title", "alpha\nbeta\n", "Anonymous"),
            ("a title", "# The Long Way Home\n\nalpha\n", "The Long Way Home"),
            ("a title above a heading", "# Home\n\n## One\nalpha\n", "Home"),
            ("a heading is not a title", "## One\nalpha\n", "Anonymous"),
            ("nothing at all", "", "Anonymous"),
        ]
    )
    def test_title(self, _name: str, document: str, expected: str) -> None:
        self.assertEqual(Manuscript(document).title, expected)


class SectionTitles(unittest.TestCase):

    @parameterized.expand(
        [
            ("no headings", "alpha\nbeta\n", ["First anonymous section"]),
            ("one heading", "## One\nalpha\n", ["First anonymous section", "One"]),
            (
                "three headings",
                "## One\na\n## Two\nb\n## Three\nc\n",
                ["First anonymous section", "One", "Two", "Three"],
            ),
            (
                "a title before the headings",
                "# Home\n\n## One\na\n## Two\nb\n",
                ["First anonymous section", "One", "Two"],
            ),
        ]
    )
    def test_section_titles(
        self, _name: str, document: str, expected: list[str]
    ) -> None:
        self.assertEqual(
            [section.title for section in Manuscript(document).sections], expected
        )


class SectionBounds(unittest.TestCase):

    def test_a_heading_opens_its_section_on_the_line_below(self) -> None:
        sections = Manuscript("## One\nalpha\nbeta\n").sections
        self.assertEqual((sections[1].start, sections[1].end), (1, 2))

    def test_a_section_is_closed_by_the_next_heading(self) -> None:
        sections = Manuscript("## One\nalpha\n## Two\nbeta\n").sections
        self.assertEqual((sections[1].start, sections[1].end), (1, 1))

    def test_the_last_section_is_closed_by_the_end_of_the_manuscript(self) -> None:
        sections = Manuscript("## One\nalpha\n## Two\nbeta\ngamma\n").sections
        self.assertEqual((sections[2].start, sections[2].end), (3, 4))

    def test_the_opening_section_runs_up_to_the_first_heading(self) -> None:
        sections = Manuscript("alpha\nbeta\n## One\ngamma\n").sections
        self.assertEqual((sections[0].start, sections[0].end), (0, 1))


class SectionAt(unittest.TestCase):

    @parameterized.expand(
        [
            ("a line before any heading", 0, "First anonymous section"),
            ("a line in the first section", 1, "First anonymous section"),
            ("a heading belongs to what it opens", 2, "One"),
            ("a line under a heading", 3, "One"),
            ("the next heading", 4, "Two"),
            ("a line under the last heading", 5, "Two"),
        ]
    )
    def test_the_section_a_line_falls_in(
        self, _name: str, line: int, expected: str
    ) -> None:
        manuscript = Manuscript("alpha\nbeta\n## One\ngamma\n## Two\ndelta\n")
        found = manuscript.section_at(line)
        assert found is not None
        self.assertEqual(found.title, expected)

    def test_a_line_past_the_end_falls_in_no_section(self) -> None:
        self.assertIsNone(Manuscript("## One\nalpha\n").section_at(99))


class SectionText(unittest.TestCase):

    @parameterized.expand(
        [
            ("one line", "## One\nalpha\n", "## One\nalpha"),
            ("several lines", "## One\nalpha\nbeta\ngamma\n", "## One\nalpha\nbeta\ngamma"),
            (
                "a blank line between paragraphs",
                "## One\nalpha\n\nbeta\n",
                "## One\nalpha\n\nbeta",
            ),
            (
                "a note to self is left out",
                "## One\nalpha\n<!-- cut this -->\nbeta\n",
                "## One\nalpha\nbeta",
            ),
            (
                "a note beside prose is kept with it",
                "## One\nalpha <!-- or not -->\nbeta\n",
                "## One\nalpha <!-- or not -->\nbeta",
            ),
        ]
    )
    def test_a_section_reads_as_its_heading_and_its_lines(
        self, _name: str, document: str, expected: str
    ) -> None:
        self.assertEqual(str(Manuscript(document).sections[1]), expected)


class Sidecars(unittest.TestCase):

    @parameterized.expand(
        [
            ("the graph", "graph_path", "/stories/story_2.graph.yaml"),
            ("the scores", "attribution_path", "/stories/story_2.attribution.yaml"),
            ("the book", "epub_path", "/stories/story_2.epub"),
        ]
    )
    def test_it_sits_beside_the_manuscript(
        self, _name: str, attribute: str, expected: str
    ) -> None:
        manuscript = Manuscript("alpha\n", Path("/stories/story_2.md"))
        self.assertEqual(getattr(manuscript, attribute), Path(expected))

    def test_the_extension_is_matched_whatever_its_case(self) -> None:
        manuscript = Manuscript("alpha\n", Path("/stories/Story.MD"))
        self.assertEqual(manuscript.graph_path.name, "Story.graph.yaml")

    def test_no_two_sidecars_share_a_name(self) -> None:
        manuscript = Manuscript("alpha\n", Path("/stories/story_2.md"))
        self.assertNotEqual(manuscript.graph_path, manuscript.attribution_path)


class LoadAndSave(unittest.TestCase):

    def test_loading_reads_the_file(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "story.md"
            path.write_text("# Home\n\n## One\nalpha\n", encoding="utf-8")
            manuscript = Manuscript.load(path)
        self.assertEqual(manuscript.title, "Home")
        self.assertEqual(manuscript.path, path)

    def test_loading_carries_the_sections(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "story.md"
            path.write_text("## One\nalpha\n## Two\nbeta\n", encoding="utf-8")
            manuscript = Manuscript.load(path)
        self.assertEqual(
            [section.title for section in manuscript.sections],
            ["First anonymous section", "One", "Two"],
        )

    def test_what_was_saved_reads_back_the_same(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "story.md"
            written = Path(directory) / "again.md"
            path.write_text("# Home\n\n## One\nalpha\n\n## Two\nbeta\n", encoding="utf-8")
            manuscript = Manuscript.load(path)
            manuscript.save(written)
            again = Manuscript.load(written)
        self.assertEqual(again.title, manuscript.title)
        self.assertEqual(
            [section.title for section in again.sections],
            [section.title for section in manuscript.sections],
        )


if __name__ == "__main__":
    unittest.main()
