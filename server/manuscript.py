"""A story manuscript as the server reads it."""

from dataclasses import dataclass
from pathlib import Path
import re

SECTION_SEPARATOR = "##"
TITLE_PREFIX = "# "

_COMMENT_OPEN = "<!--"
_COMMENT_CLOSE = "-->"


def split_comments(lines: list[str], line_indices: list[int]) -> list[tuple[int, int]]:
    """Parses an indexed list of lines in search for comments and returns
    a set of ranges that show which lines are not the comment lines"""
    ranges: list[tuple[int, int]] = []
    kept_indices: list[int] = []
    inside = False

    for line, index in zip(lines, line_indices):
        # A comment may open on one line and close on another, and one never
        # closed runs to the end, so a line is only known by what came above it.
        commented = inside
        remainder: list[str] = []
        rest = line

        while rest:
            if inside:
                close = rest.find(_COMMENT_CLOSE)
                if close < 0:
                    break
                inside = False
                rest = rest[close + len(_COMMENT_CLOSE) :]
            else:
                opened = rest.find(_COMMENT_OPEN)
                if opened < 0:
                    remainder.append(rest)
                    break
                remainder.append(rest[:opened])
                commented = True
                inside = True
                rest = rest[opened + len(_COMMENT_OPEN) :]

        # Prose standing beside a comment is still prose; only a line the comment
        # left nothing of is a comment line. A blank line the author wrote is not.
        if commented and not "".join(remainder).strip():
            if kept_indices:
                ranges.append((kept_indices[0], kept_indices[-1]))
                kept_indices = []
        else:
            kept_indices.append(index)

    if kept_indices:
        ranges.append((kept_indices[0], kept_indices[-1]))

    return ranges


class Section:
    """A `##` heading and the lines beneath it, 0-based and inclusive.

    `start` is the line after the heading, so a section's own heading sits at
    `start - 1`. A section with `end < start` has a heading and nothing under it.
    """

    def __init__(
        self, manuscript: "Manuscript", title: str | None, start: int, end: int
    ) -> None:
        self._manuscript = manuscript
        self.title = title
        self.start = start
        self.end = end

    @property
    def lines(self) -> list[tuple[int, int]]:
        indices = list(range(self.start, self.end + 1))
        return split_comments([self._manuscript.lines[i] for i in indices], indices)

    def __str__(self) -> str:
        return "\n".join(
            [f"## {self.title}"]
            + [
                self._manuscript.lines[index]
                for first, last in self.lines
                for index in range(first, last + 1)
            ]
        )


class Manuscript:

    def __init__(self, text: str, path: Path | None = None) -> None:
        self.text = text
        self.path = path
        self.lines = text.splitlines()
        self.title, self.sections = self._parse_manuscript(self.lines)
        

    def _parse_manuscript(self, lines: list[str]) -> tuple[str, list[Section]]:
        last_line_idx = len(lines) - 1
        sections: list[Section] = []
        section = Section(self, "First anonymous section", 0, last_line_idx)
        title = "Anonymous"
        for index, line in enumerate(lines):
            if line.startswith(TITLE_PREFIX):
                title = line[len(TITLE_PREFIX) :].strip()
            if line.startswith(SECTION_SEPARATOR):
                section.end = index - 1
                sections.append(section)
                section = Section(
                    self, line[len(SECTION_SEPARATOR) :].strip(), index + 1, last_line_idx
                )
        sections.append(section)
        return title, sections

    @classmethod
    def load(cls, path: Path) -> "Manuscript":
        return cls(path.read_text(encoding="utf-8"), path)

    def save(self, path: Path) -> None:
        path.write_text(
            "\n".join([
                f"# {self.title}",
            ] + [str(section) for section in self.sections])
        )

    def section_at(self, line: int) -> Section | None:
        """The section a line falls in, counting a heading as part of what it opens."""
        for section in self.sections:
            if section.start - 1 <= line <= section.end:
                return section
        return None

    @property
    def graph_path(self) -> Path:
        return self._beside(".graph.yaml")

    @property
    def attribution_path(self) -> Path:
        return self._beside(".attribution.yaml")

    @property
    def epub_path(self) -> Path:
        return self._beside(".epub")

    def _beside(self, suffix: str) -> Path:
        assert self.path is not None
        stem = re.sub(r"\.md$", "", self.path.name, flags=re.I)
        return self.path.with_name(stem + suffix)
