import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from server.inference.seq2seq import Seq2SeqModel
from server.representations.utils import (
    Piece,
    parse_sections,
    section_at,
    split_comments,
)


GRAMMAR_INSTRUCTION = "Fix the grammar"


# Blocks are runs of text separated by blank lines. Splitting on the separator
# while capturing it keeps those blank lines in the result, so the document can
# be put back together exactly as it came apart.
_SEPARATOR = re.compile(r"(\n[ \t]*\n)")

# Any letter, in any language. A piece without one is not prose.
_LETTER = re.compile(r"[^\W\d_]", re.UNICODE)


@dataclass(frozen=True)
class Span:
    """Lines of a manuscript, 0-based and inclusive."""

    start: int
    end: int


def selected_span(markdown: str, start: int, end: int) -> Span | None:
    """The lines the author selected, cut back to the prose among them."""
    return _prose_within(markdown.splitlines(), start, end)


def section_span(markdown: str, line: int) -> Span | None:
    """The section a line falls in, cut back to the prose under its heading.

    The heading is not part of it. It names the section rather than telling any
    of it, and a heading handed to the model comes back as a sentence.
    """
    section = section_at(parse_sections(markdown), line)
    if section is None:
        return None
    return _prose_within(markdown.splitlines(), section.start, section.end)


def _prose_within(lines: list[str], start: int, end: int) -> Span | None:
    """The given lines with the blank ones at either end left out.

    A blank line has nothing to correct, and a span of nothing but blank lines is
    not a passage — asking the model to correct one asks it to invent prose.
    """
    start = max(start, 0)
    end = min(end, len(lines) - 1)
    while start <= end and not lines[start].strip():
        start += 1
    while end >= start and not lines[end].strip():
        end -= 1
    return Span(start, end) if start <= end else None


def correct_span(
    model: Seq2SeqModel,
    markdown: str,
    span: Span,
    cancelled: Callable[[], bool] = lambda: False,
) -> str:
    """Return `markdown` with the prose in `span` corrected and the rest of it as it was."""
    lines = markdown.splitlines(keepends=True)
    body = "".join(lines[span.start : span.end + 1])
    prose = body.rstrip("\n")
    _, inside_note = split_comments("".join(lines[: span.start]))
    corrected = fix_grammar(model, prose, cancelled, inside_note=inside_note)
    return (
        "".join(lines[: span.start])
        + corrected
        + body[len(prose) :]
        + "".join(lines[span.end + 1 :])
    )


def fix_grammar(
    model: Seq2SeqModel,
    markdown: str,
    cancelled: Callable[[], bool] = lambda: False,
    inside_note: bool = False,
) -> str:
    """Return `markdown` with its prose corrected and its structure intact."""
    corrected: list[str] = []
    for piece in _pieces(markdown, inside_note):
        if cancelled():
            break
        if _is_prose(piece):
            corrected.append(_fix_block(model, piece.text))
        else:
            corrected.append(piece.text)
    return "".join(corrected)


def _pieces(markdown: str, inside_note: bool) -> Iterator[Piece]:
    """The text in the pieces a correction treats one at a time."""
    pieces, _ = split_comments(markdown, inside_note)
    for piece in pieces:
        if piece.comment:
            yield piece
        else:
            for block in _SEPARATOR.split(piece.text):
                yield Piece(block, comment=False)


def _is_prose(piece: Piece) -> bool:
    """Only prose is corrected."""
    return not piece.comment and bool(_LETTER.search(piece.text))


def _fix_block(model: Seq2SeqModel, block: str) -> str:
    # The corrected block should come back about as long as it went in; a budget
    # tied to its length leaves generous room without inviting a runaway.
    budget = max(64, len(block))
    reply = model.complete(GRAMMAR_INSTRUCTION, block.strip(), max_new_tokens=budget)
    # The block was split out from between blank lines and carried none of its
    # own; the model tends to frame its answer in one or two, so strip them back.
    # The space at either end is put back rather than left to the model: a block
    # ending where a note was lifted out of the line still has to keep the gap
    # the note was sitting in.
    lead = block[: len(block) - len(block.lstrip())]
    trail = block[len(block.rstrip()) :]
    return lead + reply.strip("\n") + trail
