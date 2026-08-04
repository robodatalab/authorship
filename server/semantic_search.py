from collections.abc import Callable
from dataclasses import dataclass

from server import log
from server.inference.encoder import EncoderModel
from server.manuscript import Manuscript, StoryLines

_log = log.logger(__name__)

# A line too short to say much drags a search off course more than it helps it.
MIN_WORDS_PER_SEARCHABLE_LINE = 3

MIN_SIMILARITY_AS_FRACTION_OF_BEST = 0.5
LINES_PER_ENCODE_REQUEST = 32


@dataclass
class MatchedPassage:
    first_line: int
    last_line: int
    similarity: float
    text: str


@dataclass
class SearchResults:
    passages: list[MatchedPassage]
    lines_awaiting_encoding: int


class SearchIndex:

    def __init__(self) -> None:
        self._vectors_by_manuscript: dict[str, dict[str, list[float]]] = {}

    def encode_manuscript(
        self,
        encoder: EncoderModel,
        manuscript: Manuscript,
        should_stop: Callable[[], bool] = lambda: False,
    ) -> None:
        manuscript_path = str(manuscript.path)
        vectors_by_line_text = self._vectors_by_manuscript.setdefault(
            manuscript_path, {}
        )
        searchable = [
            (number, said)
            for number, said in StoryLines(manuscript)
            if len(said.split()) >= MIN_WORDS_PER_SEARCHABLE_LINE
        ]
        not_yet_encoded = sorted(
            {text for _, text in searchable if text not in vectors_by_line_text}
        )

        if not_yet_encoded:
            _log.info("encoding %d lines of %s", len(not_yet_encoded), manuscript_path)

        for batch_start in range(0, len(not_yet_encoded), LINES_PER_ENCODE_REQUEST):
            if should_stop():
                return
            batch = not_yet_encoded[batch_start : batch_start + LINES_PER_ENCODE_REQUEST]
            vectors_by_line_text.update(zip(batch, encoder.encode(batch)))

        self._forget_lines_the_manuscript_no_longer_says(manuscript_path, searchable)

    def search(
        self,
        encoder: EncoderModel,
        manuscript: Manuscript,
        phrase: str,
        max_matching_lines: int,
    ) -> SearchResults:
        manuscript_path = str(manuscript.path)
        vectors_by_line_text = self._vectors_by_manuscript.get(manuscript_path, {})
        searchable = [
            (number, said)
            for number, said in StoryLines(manuscript)
            if len(said.split()) >= MIN_WORDS_PER_SEARCHABLE_LINE
        ]
        already_encoded = [
            (line_number, text)
            for line_number, text in searchable
            if text in vectors_by_line_text
        ]
        awaiting_encoding = len(searchable) - len(already_encoded)

        if not already_encoded or not phrase.strip():
            return SearchResults(passages=[], lines_awaiting_encoding=awaiting_encoding)

        phrase_vector = encoder.encode([phrase])[0]
        similarity_by_line = {
            line_number: _cosine_of_unit_vectors(
                vectors_by_line_text[text], phrase_vector
            )
            for line_number, text in already_encoded
        }
        minimum_similarity = (
            max(similarity_by_line.values()) * MIN_SIMILARITY_AS_FRACTION_OF_BEST
        )
        matching_lines = sorted(
            (
                line_number
                for line_number, similarity in similarity_by_line.items()
                if similarity > 0 and similarity >= minimum_similarity
            ),
            key=lambda line_number: similarity_by_line[line_number],
            reverse=True,
        )[:max_matching_lines]

        _log.info(
            "searched %d lines of %s for %r",
            len(already_encoded),
            manuscript_path,
            phrase,
        )
        return SearchResults(
            passages=_join_adjacent_lines_into_passages(
                matching_lines,
                similarity_by_line,
                manuscript.lines,
                [line_number for line_number, _ in already_encoded],
            ),
            lines_awaiting_encoding=awaiting_encoding,
        )

    def _forget_lines_the_manuscript_no_longer_says(
        self, manuscript_path: str, searchable: list[tuple[int, str]]
    ) -> None:
        vectors_by_line_text = self._vectors_by_manuscript[manuscript_path]
        self._vectors_by_manuscript[manuscript_path] = {
            text: vectors_by_line_text[text] for _, text in searchable
        }


def _join_adjacent_lines_into_passages(
    matching_lines: list[int],
    similarity_by_line: dict[int, float],
    lines: list[str],
    searchable_line_numbers: list[int],
) -> list[MatchedPassage]:
    rank_among_searchable = {
        line_number: rank for rank, line_number in enumerate(searchable_line_numbers)
    }

    adjacent_runs: list[list[int]] = []
    for line_number in sorted(matching_lines):
        previous_line = adjacent_runs[-1][-1] if adjacent_runs else None
        nothing_searchable_in_between = (
            previous_line is not None
            and rank_among_searchable[line_number]
            == rank_among_searchable[previous_line] + 1
        )
        if nothing_searchable_in_between:
            adjacent_runs[-1].append(line_number)
        else:
            adjacent_runs.append([line_number])

    # Which lines answer is a matter of similarity; the order they are read in is
    # the manuscript's, so an answer can be followed from the first chapter to the
    # last rather than jumping about the story.
    return [
        MatchedPassage(
            first_line=run[0],
            last_line=run[-1],
            similarity=max(similarity_by_line[line_number] for line_number in run),
            text="\n".join(lines[run[0] : run[-1] + 1]).strip(),
        )
        for run in adjacent_runs
    ]


def _cosine_of_unit_vectors(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))
