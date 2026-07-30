"""Which passages of a manuscript answer a phrase."""

from dataclasses import dataclass

from server import log
from server.inference.encoder import EncoderModel
from server.representations.utils import visible_lines

_log = log.logger(__name__)

# Under this a line is too thin to mean anything on its own: it would answer on
# the strength of a single word, which is what an ordinary find already does
# better.
MIN_WORDS = 3

# Lines a search answers with, before adjacent ones are run together.
DEFAULT_COUNT = 10

# How near the best line in the manuscript a line has to come to be an answer at
# all. Without a floor the tail of `count` is whatever the manuscript happens to
# hold, and in a short one those lines sit next to the real answers and would be
# run together with them into a single passage — so a search for one paragraph
# would come back holding the chapter.
MIN_FRACTION = 0.5


@dataclass
class Hit:
    """A passage that answers the phrase — 0-based lines, both ends inclusive."""

    start: int
    end: int
    score: float
    text: str


@dataclass
class SearchResults:
    hits: list[Hit]
    # Lines of prose the index has no vector for yet. A search runs against what
    # has been encoded so far rather than waiting on the rest, so this is what
    # says whether the answer is the whole answer.
    pending: int


class SearchIndex:
    """A vector per line of prose, held for as long as the server is up.

    Keyed by what a line says rather than by where it sits: a paragraph that
    moves down the manuscript keeps its vector, and only the paragraphs that
    were rewritten are encoded again. Each manuscript holds its own map, pruned
    on every indexing to the lines it currently has — an afternoon of editing
    would otherwise accumulate the vectors of every draft it passed through.

    Nothing here reaches disk. These vectors are worth seconds of GPU and
    nothing at all to a reader, unlike every other file written beside a
    manuscript, so a server restart is the only thing they cost.
    """

    def __init__(self) -> None:
        self._by_path: dict[str, dict[str, list[float]]] = {}

    def index(self, model: EncoderModel, path: str, story_markdown: str) -> None:
        """Encode whatever this manuscript says that the index does not hold."""
        held = self._by_path.get(path, {})
        passages = _passages(visible_lines(story_markdown.splitlines()))

        # Sorted so a batch is the same batch whichever order the lines arrived
        # in; a set because a manuscript that says a thing twice needs one vector
        # for it.
        missing = sorted({text for _, text in passages if text not in held})
        if missing:
            _log.info("encoding %d lines of %s", len(missing), path)
            held.update(zip(missing, model.encode(missing)))

        self._by_path[path] = {text: held[text] for _, text in passages}

    def search(
        self,
        model: EncoderModel,
        path: str,
        story_markdown: str,
        phrase: str,
        count: int = DEFAULT_COUNT,
    ) -> SearchResults:
        """The passages nearest the phrase, best first.

        Answers from the vectors in hand. A manuscript written in since it was
        indexed has lines with no vector, and those are counted rather than
        encoded here: one forward pass on the phrase is what keeps this inside a
        request, and a manuscript's worth of prose would not.
        """
        lines = visible_lines(story_markdown.splitlines())
        held = self._by_path.get(path, {})
        passages = _passages(lines)
        encoded = [(line, text) for line, text in passages if text in held]

        if not encoded or not phrase.strip():
            return SearchResults(hits=[], pending=len(passages) - len(encoded))

        query = model.encode_query(phrase)
        # Both sides are unit length, so a dot product is the cosine and
        # nearness is a sort.
        scores = {line: _dot(held[text], query) for line, text in encoded}
        floor = max(scores.values()) * MIN_FRACTION
        answering = sorted(
            (line for line, score in scores.items() if score > 0 and score >= floor),
            key=lambda line: scores[line],
            reverse=True,
        )[:count]

        _log.info("searched %d lines of %s for %r", len(encoded), path, phrase)
        return SearchResults(
            hits=_runs(answering, scores, lines, [line for line, _ in encoded]),
            pending=len(passages) - len(encoded),
        )


def _passages(lines: list[str]) -> list[tuple[int, str]]:
    """The lines a search can land on, each with the line of the manuscript it is.

    Blank lines hold nothing to answer with, and a line that was only a note to
    self is blank by the time it arrives here. A heading is the manuscript's
    structure rather than its story: asking what happens in a scene should not
    land on the word "Three".

    The text is stripped, so a line reads the same to the index whether or not a
    note trailed it — cutting a comment would otherwise spend a forward pass
    re-encoding a line nobody rewrote.
    """
    return [
        (index, line.strip())
        for index, line in enumerate(lines)
        if not line.lstrip().startswith("#") and len(line.split()) >= MIN_WORDS
    ]


def _runs(
    chosen: list[int],
    scores: dict[int, float],
    lines: list[str],
    order: list[int],
) -> list[Hit]:
    """Winners with nothing scored between them are one passage, not several.

    Paragraphs are parted by a blank line, so two that follow each other are two
    lines apart rather than one. What makes them one passage is that the
    manuscript says nothing else in between, not that their numbers run on.
    """
    position = {line: index for index, line in enumerate(order)}

    runs: list[list[int]] = []
    for line in sorted(chosen):
        if runs and position[line] == position[runs[-1][-1]] + 1:
            runs[-1].append(line)
        else:
            runs.append([line])

    return sorted(
        (
            Hit(
                start=run[0],
                end=run[-1],
                # A passage is as good as its best line: the lines around that
                # one are here because they run on from it, not because each of
                # them answered the phrase.
                score=max(scores[line] for line in run),
                text="\n".join(lines[run[0] : run[-1] + 1]).strip(),
            )
            for run in runs
        ),
        key=lambda hit: hit.score,
        reverse=True,
    )


def _dot(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))
