import re
from collections.abc import Callable

from roost import Seq2SeqModel
from server.manuscript import Manuscript, StoryLines


GRAMMAR_INSTRUCTION = "Fix the grammar"

# Any letter, in any language. A block without one is not prose.
_LETTER = re.compile(r"[^\W\d_]", re.UNICODE)


def correct_span(
    model: Seq2SeqModel,
    manuscript: Manuscript,
    start: int,
    end: int,
    cancelled: Callable[[], bool] = lambda: False,
) -> None:
    """Correct the prose in lines `start` to `end`, both included, leaving the
    notes and the structure alone.

    Raises `ValueError` if those lines hold no prose: a correction pass over a
    run of blank lines asks the model to invent some.
    """
    blocks = _prose_blocks(manuscript, start, end)
    if not blocks:
        raise ValueError("There is no prose there to correct.")

    # Back to front, so that a block coming back longer or shorter than it went
    # in does not move the blocks still to be corrected.
    for first, last in reversed(blocks):
        if cancelled():
            return
        block = "\n".join(manuscript.lines[first : last + 1])
        if not _LETTER.search(block):
            continue
        # The corrected block should come back about as long as it went in; a
        # budget tied to its length leaves room without inviting a runaway.
        corrected = model.complete(
            GRAMMAR_INSTRUCTION, block, max_new_tokens=max(64, len(block))
        )
        manuscript.delete(first, last)
        manuscript.insert(first, corrected.strip("\n"))


def _prose_blocks(
    manuscript: Manuscript, start: int, end: int
) -> list[tuple[int, int]]:
    """The paragraphs of prose those lines cover.

    A paragraph is what the model is asked to correct, and the gaps between them
    are the author's — so a break in the line numbers, whether a blank line put
    it there or a note did, ends one.
    """
    blocks: list[tuple[int, int]] = []
    paragraph: list[int] = []

    for index, _ in StoryLines(manuscript, start, end):
        if paragraph and index != paragraph[-1] + 1:
            blocks.append((paragraph[0], paragraph[-1]))
            paragraph = []
        paragraph.append(index)
    if paragraph:
        blocks.append((paragraph[0], paragraph[-1]))

    return blocks
