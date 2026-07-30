"""Tests for line contribution: a manuscript in, a score per line out.

No model. `line_contribution` takes its encoder by injection and only ever asks
it to `encode`, so a stand-in drives the whole path. The stand-in puts each
distinct line on an axis of its own and returns the unit vector of what a
passage holds — which is enough for the arithmetic under test to be real: a line
the rest of the section already says moves that vector less than one nothing
else says, exactly as an embedding would.
"""

import math
import unittest
from pathlib import Path
from typing import Sequence, cast

from yaml import safe_load

from server.inference.encoder import EncoderModel
from server.line_contribution import attribution_path_for, line_contribution, to_yaml
from server.representations.utils import parse_sections, section_at, visible_lines


class LineAxisEncoder:
    """A unit vector per passage, in a space where each distinct line is an axis."""

    def encode(self, passages: Sequence[str]) -> list[list[float]]:
        vocabulary = sorted(
            {line for passage in passages for line in passage.splitlines()}
        )
        vectors = []
        for passage in passages:
            held = passage.splitlines()
            counts = [float(held.count(line)) for line in vocabulary]
            length = math.sqrt(sum(count * count for count in counts))
            vectors.append([count / length for count in counts] if length else counts)
        return vectors


def encoder() -> EncoderModel:
    return cast(EncoderModel, LineAxisEncoder())


class VisibleLines(unittest.TestCase):
    """Notes to self are not the story."""

    def test_prose_without_comments_is_returned_as_it_stands(self) -> None:
        self.assertEqual(visible_lines(["one", "", "two"]), ["one", "", "two"])

    def test_a_comment_alone_on_a_line_leaves_it_blank(self) -> None:
        self.assertEqual(visible_lines(["<!-- fix this -->"]), [""])

    def test_prose_beside_a_comment_keeps_the_prose(self) -> None:
        self.assertEqual(visible_lines(["she left. <!-- or did she -->"]), ["she left. "])

    def test_a_comment_spanning_several_lines_blanks_all_of_them(self) -> None:
        self.assertEqual(
            visible_lines(["<!-- cut", "this whole", "passage -->", "kept"]),
            ["", "", "", "kept"],
        )

    def test_a_comment_that_never_closes_runs_to_the_end(self) -> None:
        self.assertEqual(visible_lines(["kept", "<!-- from here", "gone"]), ["kept", "", ""])

    def test_several_comments_on_one_line_all_go(self) -> None:
        self.assertEqual(
            visible_lines(["a <!-- one --> b <!-- two --> c"]), ["a  b  c"]
        )

    def test_prose_after_a_comment_closes_survives(self) -> None:
        self.assertEqual(visible_lines(["<!-- note -->real"]), ["real"])


class ParseSections(unittest.TestCase):
    """Where a manuscript divides, and what the divisions cover."""

    def test_lines_before_the_first_heading_are_a_section(self) -> None:
        sections = parse_sections("a title\n\n## One\nprose")
        self.assertEqual(sections[0].start, 0)
        self.assertEqual(sections[0].end, 1)

    def test_a_heading_starts_a_section_at_the_line_below_it(self) -> None:
        sections = parse_sections("## One\nprose")
        self.assertEqual(sections[-1].title, "One")
        self.assertEqual(sections[-1].start, 1)

    def test_the_last_section_is_closed_by_the_end_of_the_file(self) -> None:
        sections = parse_sections("## One\nfirst\n## Two\nsecond\nthird")
        self.assertEqual(sections[-1].title, "Two")
        self.assertEqual(sections[-1].end, 4)

    def test_every_heading_makes_a_section(self) -> None:
        sections = parse_sections("intro\n## One\na\n## Two\nb\n## Three\nc")
        self.assertEqual(
            [section.title for section in sections[1:]], ["One", "Two", "Three"]
        )

    def test_a_commented_heading_does_not_divide_the_manuscript(self) -> None:
        sections = parse_sections("## One\na\n<!-- ## Two -->\nb")
        self.assertEqual([section.title for section in sections[1:]], ["One"])
        self.assertEqual(sections[-1].end, 3)


class SectionAt(unittest.TestCase):
    """Which section a cursor is in."""

    def test_a_line_in_the_body_belongs_to_its_section(self) -> None:
        sections = parse_sections("## One\na\n## Two\nb")
        self.assertEqual(section_at(sections, 3).title, "Two")

    def test_a_heading_belongs_to_the_section_it_opens(self) -> None:
        sections = parse_sections("## One\na\n## Two\nb")
        self.assertEqual(section_at(sections, 2).title, "Two")

    def test_a_line_before_the_first_heading_lands_in_the_opening_section(self) -> None:
        sections = parse_sections("a title\n\n## One\nprose")
        self.assertEqual(section_at(sections, 0), sections[0])


class Contribution(unittest.TestCase):
    """Scoring the section the cursor is in."""

    def test_scores_carry_the_line_they_belong_to(self) -> None:
        scored = line_contribution(encoder(), "## One\nalpha\n\nbeta\n\ngamma", 1)
        self.assertEqual([entry.line for entry in scored.lines], [1, 3, 5])

    def test_shares_are_a_hundred_between_them(self) -> None:
        scored = line_contribution(encoder(), "## One\nalpha\nbeta\ngamma", 1)
        self.assertAlmostEqual(sum(entry.share for entry in scored.lines), 100.0)

    def test_lines_nothing_else_says_share_the_section_evenly(self) -> None:
        scored = line_contribution(encoder(), "## One\nalpha\nbeta\ngamma", 1)
        for entry in scored.lines:
            self.assertAlmostEqual(entry.share, 100.0 / 3.0)

    def test_a_line_the_section_repeats_scores_below_one_it_does_not(self) -> None:
        # Removing either "alpha" leaves the other saying it, so each moves the
        # section less than "beta", which nothing else covers.
        scored = line_contribution(encoder(), "## One\nalpha\nalpha\nbeta", 1)
        first, second, only = scored.lines
        self.assertAlmostEqual(first.share, second.share)
        self.assertGreater(only.share, first.share)

    def test_blank_lines_are_not_scored(self) -> None:
        scored = line_contribution(encoder(), "## One\nalpha\n\n\nbeta", 1)
        self.assertEqual([entry.line for entry in scored.lines], [1, 4])

    def test_commented_lines_are_not_scored(self) -> None:
        scored = line_contribution(
            encoder(), "## One\nalpha\n<!-- a note to self -->\nbeta", 1
        )
        self.assertEqual([entry.line for entry in scored.lines], [1, 3])

    def test_a_comment_beside_prose_is_not_weighed_with_it(self) -> None:
        # The note would otherwise be content of the line it trails, and the two
        # sections here would not score alike.
        noted = line_contribution(encoder(), "## One\nalpha <!-- cut? -->\nbeta", 1)
        plain = line_contribution(encoder(), "## One\nalpha \nbeta", 1)
        self.assertEqual(
            [entry.share for entry in noted.lines],
            [entry.share for entry in plain.lines],
        )

    def test_only_the_cursor_s_section_is_scored(self) -> None:
        story = "## One\nalpha\nbeta\n## Two\ngamma\ndelta"
        scored = line_contribution(encoder(), story, 4)
        self.assertEqual(scored.title, "Two")
        self.assertEqual([entry.line for entry in scored.lines], [4, 5])

    def test_a_section_of_one_line_has_nothing_to_share_out(self) -> None:
        # Removing the only line leaves nothing to compare the section against.
        scored = line_contribution(encoder(), "## One\nalpha", 1)
        self.assertEqual(scored.lines, [])
        self.assertEqual(scored.displacement, 0.0)

    def test_displacement_travels_with_the_shares(self) -> None:
        # Shares sum to 100 whatever the section is like, so this is the only
        # figure that says whether there was anything to share out.
        scored = line_contribution(encoder(), "## One\nalpha\nbeta\ngamma", 1)
        self.assertGreater(scored.displacement, 0.0)


class Sidecar(unittest.TestCase):
    """The file the job writes, beside the manuscript it scored."""

    def test_the_file_sits_beside_the_manuscript(self) -> None:
        self.assertEqual(
            attribution_path_for(Path("/stories/story_2.md")),
            Path("/stories/story_2.attribution.yaml"),
        )

    def test_the_extension_is_matched_whatever_its_case(self) -> None:
        self.assertEqual(
            attribution_path_for(Path("/stories/Story.MD")).name,
            "Story.attribution.yaml",
        )

    def test_it_is_not_the_file_the_graph_is_written_to(self) -> None:
        # The job table supersedes by target, so a scoring job sharing a name with
        # a build would cancel it.
        self.assertNotEqual(
            attribution_path_for(Path("/stories/story_2.md")).name,
            "story_2.graph.yaml",
        )

    def test_the_scored_section_round_trips(self) -> None:
        scored = line_contribution(encoder(), "## One\nalpha\nbeta\ngamma", 1)
        written = safe_load(to_yaml(scored))
        self.assertEqual(written["section"]["title"], "One")
        self.assertEqual(written["section"]["start"], 1)
        self.assertEqual(written["section"]["end"], 3)
        self.assertEqual([row["line"] for row in written["lines"]], [1, 2, 3])
        self.assertAlmostEqual(sum(row["share"] for row in written["lines"]), 100.0)

    def test_a_section_with_nothing_to_share_out_still_writes(self) -> None:
        scored = line_contribution(encoder(), "## One\nalpha", 1)
        written = safe_load(to_yaml(scored))
        self.assertEqual(written["lines"], [])
        self.assertEqual(written["section"]["displacement"], 0.0)


if __name__ == "__main__":
    unittest.main()
