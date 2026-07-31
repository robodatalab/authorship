import re
from collections.abc import Callable
from dataclasses import dataclass

from server.inference.seq2seq import Seq2SeqModel
from server.representations.utils import parse_sections, section_at


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
    """Return `markdown` with the prose in `span` corrected and the rest of it as it was.

    The newline that closed the span is put back around the correction rather
    than left to the model, which answers with prose and no particular ending —
    and a span that lost its last newline would run into the heading below it.
    """
    lines = markdown.splitlines(keepends=True)
    body = "".join(lines[span.start : span.end + 1])
    prose = body.rstrip("\n")
    corrected = fix_grammar(model, prose, cancelled)
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
) -> str:
    """Return `markdown` with its prose corrected and its structure intact."""
    pieces: list[str] = []
    for piece in _SEPARATOR.split(markdown):
        if cancelled():
            break
        # Only prose is corrected. The blank-line separators, and blocks with no
        # letters at all — a horizontal rule, a row of numbers — are left as they
        # are; there is nothing in them to spell wrong.
        if _LETTER.search(piece):
            pieces.append(_fix_block(model, piece))
        else:
            pieces.append(piece)
    return "".join(pieces)


def _fix_block(model: Seq2SeqModel, block: str) -> str:
    # The corrected block should come back about as long as it went in; a budget
    # tied to its length leaves generous room without inviting a runaway.
    budget = max(64, len(block))
    reply = model.complete(GRAMMAR_INSTRUCTION, block, max_new_tokens=budget)
    # The block was split out from between blank lines and carried none of its
    # own; the model tends to frame its answer in one or two, so strip them back.
    return reply.strip("\n")
