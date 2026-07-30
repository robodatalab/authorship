"""How much each line of a section carries the meaning of the section.

A line's score is the distance the section's embedding travels when that line is
taken out. Near nothing means the rest of the section already said it; a large
number means the section reads as something else without it.

The measurement is confined to one section — the ablations are built from its
lines and compared against its own vector, and nothing outside it is read. That
is what makes it affordable to run while somebody is typing: one section costs
one encode per line, not one per line of the manuscript.

Scores come back as shares of the section's total. Only one section is ever on
screen at a time, so a scale that spans the manuscript would buy nothing, and the
share is the figure that answers "how much of this section rests on this line".
Shares always sum to 100, so the unnormalized total travels with them: it is the
only thing that separates a section with a spine from one whose lines are all
interchangeable.
"""

from dataclasses import dataclass
from typing import Sequence

from server import log
from server.inference.encoder import EncoderModel
from server.representations.utils import parse_sections, section_at, visible_lines

_log = log.logger(__name__)


@dataclass
class LineContribution:
    # 0-based line in the manuscript, not in the section.
    line: int
    share: float


@dataclass
class SectionContribution:
    title: str
    start: int
    end: int
    lines: list[LineContribution]
    # The summed displacement, before it was shared out.
    displacement: float


def line_contribution(
    model: EncoderModel, story_markdown: str, line: int
) -> SectionContribution | None:
    """Score the lines of whichever section covers `line`.

    Returns None when no section covers it, which an empty manuscript is the
    only real way to arrange.
    """
    lines = visible_lines(story_markdown.splitlines())
    section = section_at(parse_sections(story_markdown), line)
    if section is None:
        return None

    # Blank lines have nothing to ablate, and a variant that dropped every line
    # of a run of them would encode as empty — which comes back as NaN. A line
    # that was only a comment is blank by the time it arrives here.
    numbered = [
        (index, lines[index])
        for index in range(max(section.start, 0), min(section.end, len(lines) - 1) + 1)
        if lines[index].strip()
    ]

    # One line is the whole section: removing it leaves nothing to compare against,
    # and a lone line trivially carries all of it.
    if len(numbered) < 2:
        return SectionContribution(
            section.title, section.start, section.end, [], 0.0
        )

    texts = [text for _, text in numbered]
    displacements = _displacements(model, texts)
    total = sum(displacements)

    _log.info(
        "scored %d lines of %r, displacement %.4f",
        len(texts),
        section.title,
        total,
    )
    return SectionContribution(
        title=section.title,
        start=section.start,
        end=section.end,
        displacement=total,
        lines=[
            LineContribution(
                line=index,
                share=100.0 * displacement / total if total else 0.0,
            )
            for (index, _), displacement in zip(numbered, displacements)
        ],
    )


def _displacements(model: EncoderModel, texts: Sequence[str]) -> list[float]:
    """How far the section's vector moves when each line is left out of it."""
    variants = ["\n".join(texts)]
    variants += ["\n".join(texts[:i] + texts[i + 1 :]) for i in range(len(texts))]

    vectors = model.encode(variants)
    whole = vectors[0]
    # The vectors are unit length, so a dot product is the cosine. Rounding can
    # put a near-identical pair a hair over 1, which would read as a line that
    # holds the section together by being absent.
    return [max(0.0, 1.0 - _dot(vector, whole)) for vector in vectors[1:]]


def _dot(left: Sequence[float], right: Sequence[float]) -> float:
    return sum(a * b for a, b in zip(left, right))
