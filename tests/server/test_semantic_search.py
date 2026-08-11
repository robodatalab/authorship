import unittest
from pathlib import Path
from unittest import mock

from server.manuscript import Manuscript
from server.representations.semantic_search import LINES_PER_ENCODE_REQUEST, SearchIndex

MANUSCRIPT_PATH = Path("/stories/story.md")
ANOTHER_MANUSCRIPT_PATH = Path("/stories/other.md")
MAX_MATCHING_LINES = 10

PHRASE = "what the author is looking for"
PHRASE_VECTOR = [1.0, 0.0]

IDENTICAL_TO_PHRASE = [1.0, 0.0]
NEAR_THE_PHRASE = [0.8, 0.6]
TOO_FAR_FROM_PHRASE_TO_MATCH = [0.28, 0.96]
UNRELATED_TO_PHRASE = [0.0, 1.0]

FOUR_PARAGRAPHS = (
    "the first paragraph\n"
    "\n"
    "the second paragraph\n"
    "\n"
    "the third paragraph\n"
    "\n"
    "the fourth paragraph\n"
)
FIRST_PARAGRAPH_LINE = 0
SECOND_PARAGRAPH_LINE = 2
THIRD_PARAGRAPH_LINE = 4

TWO_PARAGRAPHS = "the first paragraph\n\nthe second paragraph\n"

LONGER_THAN_ONE_BATCH = "\n\n".join(
    f"paragraph {number} of the story"
    for number in range(LINES_PER_ENCODE_REQUEST + 5)
)
FIRST_PARAGRAPH_OF_THE_LONGER_STORY = "paragraph 0 of the story"


class SearchableLines(unittest.TestCase):

    def setUp(self) -> None:
        self.vector_by_line: dict[str, list[float]] = {}
        self.encoder = mock.MagicMock()
        self.encoder.encode.side_effect = lambda lines: [
            self.vector_by_line.get(line, UNRELATED_TO_PHRASE) for line in lines
        ]
        self.encoder.encode_query.return_value = PHRASE_VECTOR
        self.index = SearchIndex()

    def test_a_section_heading_never_matches_even_when_it_is_the_nearest_text(
        self,
    ) -> None:
        story = "prose above\n\n## A Heading\n\nthe only prose in this manuscript"
        self.vector_by_line = {
            "## A Heading": IDENTICAL_TO_PHRASE,
            "the only prose in this manuscript": NEAR_THE_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(story, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(story, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual([match.first_line for match in results.passages], [4])

    def test_a_commented_out_line_never_matches(self) -> None:
        story = "<!-- the note the author left themselves -->\n\nthe only prose here"
        self.vector_by_line = {
            "<!-- the note the author left themselves -->": IDENTICAL_TO_PHRASE,
            "the only prose here": NEAR_THE_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(story, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(story, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual([match.first_line for match in results.passages], [2])

    def test_a_comment_beside_prose_leaves_the_prose_matching(self) -> None:
        story = "the only prose here\n<!-- cut? -->\n\nthe second paragraph"
        self.vector_by_line = {"the only prose here": IDENTICAL_TO_PHRASE}

        self.index.encode_manuscript(self.encoder, Manuscript(story, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(story, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual([match.first_line for match in results.passages], [0])

    def test_a_passage_does_not_reach_back_over_the_blank_lines_above_it(self) -> None:
        story = "the first paragraph\n\n\n\nthe second paragraph"
        self.vector_by_line = {"the second paragraph": IDENTICAL_TO_PHRASE}

        self.index.encode_manuscript(self.encoder, Manuscript(story, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(story, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        match = results.passages[0]
        self.assertEqual((match.first_line, match.last_line), (4, 4))


class Ranking(unittest.TestCase):

    def setUp(self) -> None:
        self.vector_by_line: dict[str, list[float]] = {}
        self.encoder = mock.MagicMock()
        self.encoder.encode.side_effect = lambda lines: [
            self.vector_by_line.get(line, UNRELATED_TO_PHRASE) for line in lines
        ]
        self.encoder.encode_query.return_value = PHRASE_VECTOR
        self.index = SearchIndex()

    def test_passages_come_in_the_order_the_manuscript_says_them(self) -> None:
        self.vector_by_line = {
            "the first paragraph": NEAR_THE_PHRASE,
            "the third paragraph": IDENTICAL_TO_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(
            [match.first_line for match in results.passages],
            [FIRST_PARAGRAPH_LINE, THIRD_PARAGRAPH_LINE],
        )

    def test_a_line_below_half_the_best_similarity_does_not_match(self) -> None:
        self.vector_by_line = {
            "the first paragraph": IDENTICAL_TO_PHRASE,
            "the third paragraph": TOO_FAR_FROM_PHRASE_TO_MATCH,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(
            [match.first_line for match in results.passages], [FIRST_PARAGRAPH_LINE]
        )

    def test_a_line_unrelated_to_the_phrase_does_not_match(self) -> None:
        self.vector_by_line = {"the first paragraph": IDENTICAL_TO_PHRASE}

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(
            [match.first_line for match in results.passages], [FIRST_PARAGRAPH_LINE]
        )

    def test_nothing_matches_when_every_line_is_unrelated(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(results.passages, [])

    def test_max_matching_lines_bounds_the_answer(self) -> None:
        self.vector_by_line = {
            "the first paragraph": IDENTICAL_TO_PHRASE,
            "the second paragraph": IDENTICAL_TO_PHRASE,
            "the third paragraph": IDENTICAL_TO_PHRASE,
            "the fourth paragraph": IDENTICAL_TO_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, 1
        )

        self.assertEqual(len(results.passages), 1)

    def test_an_empty_phrase_matches_nothing(self) -> None:
        self.vector_by_line = {"the first paragraph": IDENTICAL_TO_PHRASE}

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), "   ", MAX_MATCHING_LINES
        )

        self.assertEqual(results.passages, [])


class JoiningAdjacentLines(unittest.TestCase):

    def setUp(self) -> None:
        self.vector_by_line: dict[str, list[float]] = {}
        self.encoder = mock.MagicMock()
        self.encoder.encode.side_effect = lambda lines: [
            self.vector_by_line.get(line, UNRELATED_TO_PHRASE) for line in lines
        ]
        self.encoder.encode_query.return_value = PHRASE_VECTOR
        self.index = SearchIndex()

    def test_matching_lines_with_nothing_matching_between_them_are_one_passage(
        self,
    ) -> None:
        self.vector_by_line = {
            "the first paragraph": IDENTICAL_TO_PHRASE,
            "the second paragraph": NEAR_THE_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(
            [(match.first_line, match.last_line) for match in results.passages],
            [(FIRST_PARAGRAPH_LINE, SECOND_PARAGRAPH_LINE)],
        )

    def test_matching_lines_with_an_unmatched_line_between_them_stay_apart(self) -> None:
        self.vector_by_line = {
            "the first paragraph": IDENTICAL_TO_PHRASE,
            "the third paragraph": NEAR_THE_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(
            [(match.first_line, match.last_line) for match in results.passages],
            [
                (FIRST_PARAGRAPH_LINE, FIRST_PARAGRAPH_LINE),
                (THIRD_PARAGRAPH_LINE, THIRD_PARAGRAPH_LINE),
            ],
        )

    def test_a_passage_carries_every_line_between_its_ends(self) -> None:
        self.vector_by_line = {
            "the first paragraph": IDENTICAL_TO_PHRASE,
            "the second paragraph": NEAR_THE_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(
            results.passages[0].text, "the first paragraph\n\nthe second paragraph"
        )

    def test_a_passage_takes_the_similarity_of_its_nearest_line(self) -> None:
        self.vector_by_line = {
            "the first paragraph": NEAR_THE_PHRASE,
            "the second paragraph": IDENTICAL_TO_PHRASE,
        }

        self.index.encode_manuscript(self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(FOUR_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(results.passages[0].similarity, 1.0)


class Encoding(unittest.TestCase):

    def setUp(self) -> None:
        self.vector_by_line: dict[str, list[float]] = {}
        self.encoder = mock.MagicMock()
        self.encoder.encode.side_effect = lambda lines: [
            self.vector_by_line.get(line, UNRELATED_TO_PHRASE) for line in lines
        ]
        self.encoder.encode_query.return_value = PHRASE_VECTOR
        self.index = SearchIndex()

    def test_a_manuscript_never_encoded_matches_nothing_and_reports_every_line(
        self,
    ) -> None:
        results = self.index.search(
            self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(results.passages, [])
        self.assertEqual(results.lines_awaiting_encoding, 2)

    def test_an_encoded_manuscript_has_no_lines_awaiting_encoding(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))
        results = self.index.search(
            self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(results.lines_awaiting_encoding, 0)

    def test_a_line_written_since_the_encoding_is_awaiting_encoding(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))
        written_since = TWO_PARAGRAPHS + "\nthe third paragraph\n"

        results = self.index.search(
            self.encoder, Manuscript(written_since, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(results.lines_awaiting_encoding, 1)

    def test_encoding_again_asks_for_nothing_that_has_not_changed(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))

        self.assertEqual(self.encoder.encode.call_count, 1)

    def test_only_the_lines_that_were_rewritten_are_encoded_again(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))
        rewritten = TWO_PARAGRAPHS.replace(
            "the second paragraph", "a rewritten paragraph"
        )

        self.index.encode_manuscript(self.encoder, Manuscript(rewritten, MANUSCRIPT_PATH))

        self.assertEqual(
            self.encoder.encode.call_args_list[1].args[0], ["a rewritten paragraph"]
        )

    def test_a_line_that_only_moved_is_not_encoded_again(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))
        self.index.encode_manuscript(self.encoder, Manuscript("\n\n" + TWO_PARAGRAPHS, MANUSCRIPT_PATH))

        self.assertEqual(self.encoder.encode.call_count, 1)

    def test_a_line_the_manuscript_dropped_is_encoded_afresh_when_it_returns(
        self,
    ) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))
        self.index.encode_manuscript(self.encoder, Manuscript("the first paragraph", MANUSCRIPT_PATH))

        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))

        self.assertEqual(
            self.encoder.encode.call_args_list[-1].args[0], ["the second paragraph"]
        )

    def test_lines_are_encoded_in_batches(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(LONGER_THAN_ONE_BATCH, MANUSCRIPT_PATH))

        self.assertEqual(
            [len(call.args[0]) for call in self.encoder.encode.call_args_list],
            [LINES_PER_ENCODE_REQUEST, 5],
        )

    def test_lines_encoded_so_far_match_before_the_rest_are_encoded(self) -> None:
        self.vector_by_line = {
            FIRST_PARAGRAPH_OF_THE_LONGER_STORY: IDENTICAL_TO_PHRASE
        }

        self.index.encode_manuscript(self.encoder, Manuscript(LONGER_THAN_ONE_BATCH, MANUSCRIPT_PATH), lambda: self.encoder.encode.call_count >= 1,)
        results = self.index.search(
            self.encoder, Manuscript(LONGER_THAN_ONE_BATCH, MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual([match.first_line for match in results.passages], [0])
        self.assertEqual(results.lines_awaiting_encoding, 5)

    def test_encoding_stops_when_it_is_superseded(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(LONGER_THAN_ONE_BATCH, MANUSCRIPT_PATH), lambda: True)

        self.encoder.encode.assert_not_called()

    def test_each_manuscript_is_encoded_apart_from_the_others(self) -> None:
        self.index.encode_manuscript(self.encoder, Manuscript(TWO_PARAGRAPHS, MANUSCRIPT_PATH))

        results = self.index.search(
            self.encoder, Manuscript(TWO_PARAGRAPHS, ANOTHER_MANUSCRIPT_PATH), PHRASE, MAX_MATCHING_LINES
        )

        self.assertEqual(results.passages, [])
        self.assertEqual(results.lines_awaiting_encoding, 2)
 

if __name__ == "__main__":
    unittest.main()
