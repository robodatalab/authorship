"""How much each line of a section carries the meaning of the section."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any

from yaml import YAMLError, dump, safe_load

from server import log
from server.inference.encoder import EncoderModel
from server.representations.utils import parse_sections, section_at, visible_lines

_log = log.logger(__name__)


def attribution_path_for(document: Path) -> Path:
    stem = re.sub(r"\.md$", "", document.name, flags=re.I)
    return document.with_name(stem + ".attribution.yaml")


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


def write_attribution(path: Path, contribution: SectionContribution) -> None:
    """Put this section's scores into the file, leaving the rest as they were.

    Sections are scored one at a time, as they are asked for, but a manuscript's
    scores are read all at once. A section is identified by the line it starts
    on: two cannot share one.
    """
    sections = [
        section
        for section in _sections_in(path)
        if section.get("start") != contribution.start
    ]
    sections.append(_section_fields(contribution))
    sections.sort(key=lambda section: section.get("start", 0))
    path.write_text(dump({"sections": sections}, sort_keys=False))


def _section_fields(contribution: SectionContribution) -> dict[str, Any]:
    return {
        "title": contribution.title,
        "start": contribution.start,
        "end": contribution.end,
        "displacement": round(contribution.displacement, 6),
        "lines": [
            {"line": entry.line, "share": round(entry.share, 2)}
            for entry in contribution.lines
        ],
    }


def _sections_in(path: Path) -> list[dict[str, Any]]:
    """What the file already holds, or nothing if it holds nothing usable.

    A manuscript that has never been scored has no file, and one that will not
    parse is replaced rather than allowed to fail the job that would have
    rewritten it — losing scores that can be recomputed beats refusing to score
    anything ever again.
    """
    if not path.exists():
        return []
    try:
        parsed = safe_load(path.read_text())
    except YAMLError:
        return []
    if not isinstance(parsed, dict):
        return []
    return [
        section
        for section in parsed.get("sections") or []
        if isinstance(section, dict) and "start" in section
    ]


def _displacements(model: EncoderModel, texts: list[str]) -> list[float]:
    """How far the section's vector moves when each line is left out of it."""
    variants = ["\n".join(texts)]
    variants += ["\n".join(texts[:i] + texts[i + 1 :]) for i in range(len(texts))]

    vectors = model.encode(variants)
    whole = vectors[0]
    # The vectors are unit length, so a dot product is the cosine. Rounding can
    # put a near-identical pair a hair over 1, which would read as a line that
    # holds the section together by being absent.
    return [max(0.0, 1.0 - _dot(vector, whole)) for vector in vectors[1:]]


def _dot(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))
