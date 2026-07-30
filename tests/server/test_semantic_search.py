"""Tests for semantic search: a manuscript and a phrase in, passages out.

No model. `SearchIndex` takes its encoder by injection and only ever asks it to
`encode` and `encode_query`, so a stand-in drives the whole path. The stand-in
puts each word of the manuscript on an axis of its own and returns the unit
vector of what a text holds — which is enough for the ranking under test to be
real: a line that says what the phrase says scores above one that does not,
exactly as an embedding would.
"""

import math
import re
import unittest
from typing import Sequence, cast

from server.inference.encoder import EncoderModel
from server.semantic_search import DEFAULT_COUNT, INDEX_CHUNK, Hit, SearchIndex

PATH = "/stories/story.md"


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def long_story(paragraphs: int) -> str:
    return "\n\n".join(f"line {n} of the story" for n in range(paragraphs))


class WordSpaceEncoder:
    """A unit vector per text, in a space where each word of a manuscript is an axis.

    The lines and the phrase are encoded in separate calls and have to land in
    the same space, so the axes are fixed when the encoder is made rather than
    taken from whatever was handed over at the time. A word the manuscript never
    uses is off every axis and moves nothing, as a word the model had no sense of
    would.
    """

    def __init__(self, story: str) -> None:
        self._axes = sorted(set(words(story)))
        # Every batch this was asked for, so a test can see what was encoded
        # again and what was not.
        self.batches: list[list[str]] = []

    def encode(self, passages: Sequence[str]) -> list[list[float]]:
        self.batches.append(list(passages))
        return [self._vector(text) for text in passages]

    def encode_query(self, query: str, task: str = "") -> list[float]:
        return self._vector(query)

    def _vector(self, text: str) -> list[float]:
        held = words(text)
        counts = [float(held.count(axis)) for axis in self._axes]
        length = math.sqrt(sum(count * count for count in counts))
        return [count / length for count in counts] if length else counts


def found(story: str, phrase: str, count: int = DEFAULT_COUNT) -> list[Hit]:
    """The passages of a freshly indexed manuscript that answer a phrase."""
    index = SearchIndex()
    model = cast(EncoderModel, WordSpaceEncoder(story))
    index.index(model, PATH, story)
    return index.search(model, PATH, story, phrase, count).hits


class Passages(unittest.TestCase):
    """Which lines a search can land on."""

    def test_a_line_that_says_the_phrase_is_found(self) -> None:
        story = "## One\nthe horse bolted through the gate\n\nshe poured the tea"
        self.assertEqual(found(story, "the horse bolted")[0].start, 1)

    def test_headings_are_not_searchable(self) -> None:
        # Structure, not story. Asking what happens should not land on "Three".
        # Both headings say "horse" more purely than the prose does, so they
        # would come first if they were passages at all.
        story = "# The Horse\n\n## Horse\n\nshe poured the tea slowly"
        self.assertEqual([hit.start for hit in found(story, "the horse tea")], [4])

    def test_blank_lines_are_not_searchable(self) -> None:
        # The passage is the prose, not the run of nothing above it.
        story = "the horse bolted through the gate\n\n\nshe poured the tea slowly"
        hit = found(story, "tea slowly")[0]
        self.assertEqual((hit.start, hit.end), (3, 3))

    def test_a_line_of_one_or_two_words_is_not_searchable(self) -> None:
        # Too thin to mean anything on its own; it would answer on one word, and
        # saying nothing else would put it above the line that says more.
        story = "the horse\n\nthe horse bolted through the gate"
        self.assertEqual([hit.start for hit in found(story, "horse")], [2])

    def test_commented_lines_are_not_searchable(self) -> None:
        story = "<!-- the horse bolted here -->\n\nshe poured the tea slowly"
        self.assertEqual([hit.start for hit in found(story, "the horse bolted")], [2])

    def test_a_comment_beside_prose_leaves_the_prose_searchable(self) -> None:
        story = "the horse bolted <!-- cut? -->\n\nshe poured the tea slowly"
        self.assertEqual(found(story, "the horse bolted")[0].start, 0)


class Ranking(unittest.TestCase):
    """Best first, and only what answers."""

    STORY = (
        "the horse bolted through the open gate\n"
        "\n"
        "she poured the tea and waited\n"
        "\n"
        "the gate swung shut behind them\n"
    )

    def test_the_nearest_passage_comes_first(self) -> None:
        self.assertEqual(found(self.STORY, "a horse bolting")[0].start, 0)

    def test_passages_are_ordered_by_how_near_they_are(self) -> None:
        scores = [hit.score for hit in found(self.STORY, "the gate")]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_a_line_far_from_the_best_is_not_an_answer(self) -> None:
        # The tea is what the manuscript happens to hold, not what was asked.
        self.assertEqual([hit.start for hit in found(self.STORY, "the gate")], [0, 4])

    def test_count_bounds_the_answer(self) -> None:
        self.assertEqual(len(found(self.STORY, "the gate", count=1)), 1)

    def test_an_empty_phrase_answers_nothing(self) -> None:
        self.assertEqual(found(self.STORY, "   "), [])


class Runs(unittest.TestCase):
    """A passage may be more than one line."""

    STORY = (
        "the horse bolted through the open gate\n"
        "\n"
        "the gate swung shut behind them\n"
        "\n"
        "she poured the tea and waited\n"
        "\n"
        "the gate was painted green\n"
    )

    def test_a_single_line_passage_starts_and_ends_on_it(self) -> None:
        hit = found(self.STORY, "pouring tea", count=1)[0]
        self.assertEqual((hit.start, hit.end), (4, 4))

    def test_answers_with_nothing_scored_between_them_are_one_passage(self) -> None:
        # Lines 0 and 2 are parted by a blank line, so they follow each other.
        hits = found(self.STORY, "the gate", count=3)
        self.assertEqual((hits[0].start, hits[0].end), (0, 2))

    def test_a_passage_carries_the_lines_between_its_ends(self) -> None:
        hit = found(self.STORY, "the gate", count=3)[0]
        self.assertEqual(
            hit.text,
            "the horse bolted through the open gate\n\nthe gate swung shut behind them",
        )

    def test_answers_with_a_line_between_them_stay_apart(self) -> None:
        # The tea sits between them and did not answer, so line 6 is its own
        # passage rather than the tail of the one that opens the manuscript.
        hits = found(self.STORY, "the gate", count=3)
        self.assertEqual([(hit.start, hit.end) for hit in hits], [(0, 2), (6, 6)])

    def test_a_passage_scores_as_its_best_line(self) -> None:
        # The second line is in it because it runs on from the first, not
        # because it answered as well.
        joined = found(self.STORY, "the gate", count=3)[0]
        alone = found(self.STORY, "the gate", count=1)[0]
        self.assertAlmostEqual(joined.score, alone.score)


class Index(unittest.TestCase):
    """What is encoded, and what is not encoded again."""

    STORY = "the horse bolted through the gate\n\nshe poured the tea and waited\n"

    def test_a_manuscript_never_indexed_answers_nothing_and_reports_it(self) -> None:
        index = SearchIndex()
        model = cast(EncoderModel, WordSpaceEncoder(self.STORY))
        results = index.search(model, PATH, self.STORY, "the horse")
        self.assertEqual(results.hits, [])
        self.assertEqual(results.pending, 2)

    def test_an_indexed_manuscript_has_nothing_pending(self) -> None:
        index = SearchIndex()
        model = cast(EncoderModel, WordSpaceEncoder(self.STORY))
        index.index(model, PATH, self.STORY)
        self.assertEqual(index.search(model, PATH, self.STORY, "the horse").pending, 0)

    def test_a_line_written_since_the_indexing_is_pending(self) -> None:
        index = SearchIndex()
        model = cast(EncoderModel, WordSpaceEncoder(self.STORY))
        index.index(model, PATH, self.STORY)
        written = self.STORY + "\nthe gate swung shut behind them\n"
        self.assertEqual(index.search(model, PATH, written, "the gate").pending, 1)

    def test_indexing_again_encodes_nothing_that_has_not_changed(self) -> None:
        index = SearchIndex()
        model = WordSpaceEncoder(self.STORY)
        index.index(cast(EncoderModel, model), PATH, self.STORY)
        index.index(cast(EncoderModel, model), PATH, self.STORY)
        self.assertEqual(len(model.batches), 1)

    def test_only_the_lines_that_were_rewritten_are_encoded_again(self) -> None:
        index = SearchIndex()
        model = WordSpaceEncoder(self.STORY + " gate swung shut")
        index.index(cast(EncoderModel, model), PATH, self.STORY)
        rewritten = self.STORY.replace("she poured the tea and waited", "gate swung shut")
        index.index(cast(EncoderModel, model), PATH, rewritten)
        self.assertEqual(model.batches[1], ["gate swung shut"])

    def test_a_line_that_only_moved_is_not_encoded_again(self) -> None:
        # Keyed by what a line says, not by where it sits.
        index = SearchIndex()
        model = WordSpaceEncoder(self.STORY)
        index.index(cast(EncoderModel, model), PATH, self.STORY)
        index.index(cast(EncoderModel, model), PATH, "\n\n" + self.STORY)
        self.assertEqual(len(model.batches), 1)

    def test_a_line_the_manuscript_no_longer_says_is_dropped(self) -> None:
        # Pruned rather than kept, so an afternoon of editing does not accumulate
        # the vectors of every draft it passed through. Writing the line back is
        # what shows it went: it has to be encoded a second time.
        index = SearchIndex()
        model = WordSpaceEncoder(self.STORY)
        index.index(cast(EncoderModel, model), PATH, self.STORY)
        index.index(cast(EncoderModel, model), PATH, "the horse bolted through the gate")
        index.index(cast(EncoderModel, model), PATH, self.STORY)
        self.assertEqual(model.batches[-1], ["she poured the tea and waited"])

    def test_lines_are_encoded_a_chunk_at_a_time(self) -> None:
        # The encoder answers one caller at a time. A manuscript encoded in a
        # single call would hold it for the whole pass, and a search would wait
        # out the indexing rather than answering from what was ready.
        story = long_story(INDEX_CHUNK + 5)
        model = WordSpaceEncoder(story)
        SearchIndex().index(cast(EncoderModel, model), PATH, story)
        self.assertEqual([len(batch) for batch in model.batches], [INDEX_CHUNK, 5])

    def test_a_manuscript_answers_while_it_is_still_being_encoded(self) -> None:
        # Vectors published only at the end of a pass leave a search answering
        # nothing for as long as the whole manuscript takes to read.
        story = long_story(INDEX_CHUNK + 5)
        index = SearchIndex()
        model = WordSpaceEncoder(story)
        encoded = model.encode
        found_during: list[int] = []

        def encode_and_look(texts: Sequence[str]) -> list[list[float]]:
            vectors = encoded(texts)
            found_during.append(
                len(
                    index.search(
                        cast(EncoderModel, model), PATH, story, "line 0 of the story"
                    ).hits
                )
            )
            return vectors

        model.encode = encode_and_look  # type: ignore[method-assign]
        index.index(cast(EncoderModel, model), PATH, story)

        self.assertEqual(found_during[0], 0)
        self.assertGreater(found_during[1], 0)

    def test_a_superseded_pass_stops_rather_than_spending_the_encoder(self) -> None:
        story = long_story(INDEX_CHUNK + 5)
        model = WordSpaceEncoder(story)
        SearchIndex().index(cast(EncoderModel, model), PATH, story, lambda: True)
        self.assertEqual(model.batches, [])

    def test_manuscripts_are_indexed_apart_from_each_other(self) -> None:
        index = SearchIndex()
        model = cast(EncoderModel, WordSpaceEncoder(self.STORY))
        index.index(model, PATH, self.STORY)
        other = index.search(model, "/stories/other.md", self.STORY, "the horse")
        self.assertEqual(other.hits, [])
        self.assertEqual(other.pending, 2)


if __name__ == "__main__":
    unittest.main()
