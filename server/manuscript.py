"""A story manuscript as the server reads it."""

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
import re

SECTION_SEPARATOR = "##"
TITLE_PREFIX = "# "

_COMMENT_OPEN = "<!--"
_COMMENT_CLOSE = "-->"


def _split_comments(lines: list[str], line_indices: list[int]) -> list[tuple[int, int]]:
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
    def line_ranges_in_manuscript(self) -> list[tuple[int, int]]:
        indices = list(range(self.start, self.end + 1))
        return _split_comments([self._manuscript.lines[i] for i in indices], indices)  

    @property
    def lines(self) -> Iterator[str]:
        for first, last in self.line_ranges_in_manuscript:
            for index in range(first, last + 1):
                line = self._manuscript.lines[index]
                if line.strip() and not line.startswith(TITLE_PREFIX):
                    yield line


    def reference(self, line: int, phrase: str) -> tuple[int, int] | None:
        """Where `phrase` falls on `line`, in characters, 0-based and inclusive."""
        if not phrase:
            raise ValueError("Empty phrase")
        if line < 0:
            raise IndexError(f"Invalid line number: {line} < 0")
        
        lines = list(self.lines)
        if line >= len(lines):
            raise IndexError(f"Invalid line number: {line} >= {len(lines)}")

        at = lines[line].index(phrase)
        return None if at < 0 else (at, at + len(phrase) - 1)

    def __str__(self) -> str:
        # The section as the author wrote it, notes and all —
        # `line_ranges_in_manuscript` says which of it is story, which is a
        # different question from what is on the page.
        return "\n".join(
            [self._manuscript.lines[self.start - 1]]
            + self._manuscript.lines[self.start : self.end + 1]
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
        title = "Anonymous"
        # What stands above the first `##` is the manuscript's front matter — its
        # title and the notes kept with it — and not a section of the story, so
        # the first section is the one the first heading opens.
        opened: Section | None = None
        for index, line in enumerate(lines):
            if line.startswith(TITLE_PREFIX):
                title = line[len(TITLE_PREFIX) :].strip()
            if line.startswith(SECTION_SEPARATOR):
                if opened is not None:
                    opened.end = index - 1
                    sections.append(opened)
                opened = Section(
                    self, line[len(SECTION_SEPARATOR) :].strip(), index + 1, last_line_idx
                )
        if opened is not None:
            sections.append(opened)
        return title, sections

    @classmethod
    def load(cls, path: Path) -> "Manuscript":
        return cls(path.read_text(encoding="utf-8"), path)

    def delete(self, start: int, end: int) -> None:
        """Take out lines `start` to `end`, both included."""
        del self.lines[start : end + 1]
        self._reread()

    def insert(self, at: int, text: str) -> None:
        """Put `text` in as whole lines, the first of them landing on line `at`."""
        self.lines[at:at] = text.splitlines()
        self._reread()

    def _reread(self) -> None:
        # Where the sections fall is a reading of the lines, so a manuscript that
        # has been written in is read again rather than adjusted.
        self.text = "\n".join(self.lines) + ("\n" if self.text.endswith("\n") else "")
        self.title, self.sections = self._parse_manuscript(self.lines)

    def __str__(self) -> str:
        # The front matter belongs to no section, so it is written from the lines
        # themselves; each section carries its own heading down with it.
        opens_at = self.sections[0].start - 1 if self.sections else len(self.lines)
        written = "\n".join(
            self.lines[:opens_at] + [str(section) for section in self.sections]
        )
        return written + "\n" if self.text.endswith("\n") else written

    def save(self, path: Path) -> None:
        path.write_text(str(self))

    def section_at(self, line: int) -> Section | None:
        """The section a line falls in, counting a heading as part of what it opens."""
        for section in self.sections:
            if section.start - 1 <= line <= section.end:
                return section
        return None

    @property
    def epub_path(self) -> Path:
        return self._beside(".epub")

    def _beside(self, suffix: str) -> Path:
        assert self.path is not None
        stem = re.sub(r"\.md$", "", self.path.name, flags=re.I)
        return self.path.with_name(stem + suffix)


class StoryLines:
    """Given a manuscript it walks only the lines that comprise the story, excluding titles and comments.
    """

    def __init__(
        self, manuscript: Manuscript, start: int = 0, end: int | None = None
    ) -> None:
        self._manuscript = manuscript
        self._start = start
        self._end = len(manuscript.lines) - 1 if end is None else end

    def __iter__(self) -> Iterator[tuple[int, str]]:
        for section in self._manuscript.sections:
            for first, last in section.line_ranges_in_manuscript:
                for index in range(max(first, self._start), min(last, self._end) + 1):
                    said = self._manuscript.lines[index].strip()
                    if said:
                        yield index, said
