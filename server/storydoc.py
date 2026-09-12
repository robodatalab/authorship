"""A story and the layout it is published in, in one human-readable file.

The file is `<name>.author`, and it is markdown. What makes it a story document
is that the markdown is cut into cells, each opened by a marker that says what
the cell *is*:

    <!-- cell: chapter title="The First Night" -->

    The lantern had gone out again.

    <!-- cell: image src="art/cover.jpg" full-page="yes" -->

The marker is an HTML comment, so every reader that renders markdown renders the
document and shows none of the scaffolding, and every editor that opens text can
edit it. There is no custom editor a person is obliged to use — which is the
whole point of not being a notebook full of escaped JSON strings.

Two properties are load-bearing:

**The format is open.** A cell's type is any name, and this module knows nothing
about most of them. An unrecognised type is carried through parse and save
untouched, so a document written by a newer version — or by hand — survives a
round trip through an older one rather than losing the cells it could not name.

**Plain markdown is already a story document.** A file with no markers at all
parses as one `markdown` cell holding the lot. Nothing has to be converted, and a
document whose markers are all deleted is still the story.

The one ambiguity worth naming: a line inside a cell that itself looks like a
marker opens a new cell. Markdown has the same bargain with fences.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from pathlib import Path

EXTENSION = ".author"

MARKDOWN = "markdown"
CHAPTER = "chapter"
PART = "part"
TITLE_PAGE = "title-page"
IMAGE = "image"
CONTENTS = "contents"
DISCLAIMER = "disclaimer"
ABOUT = "about"
BLURB = "blurb"
NOTE = "note"
RECAP = "recap"

# What an attribute says when the answer to it is no, and the attribute a part
# says it of: whether the book prints a page where the part stands.
NO = "no"
PRINT = "print"

FULL_PAGE = "full-page"

_MARKER = re.compile(r"^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$")
_ATTR = re.compile(r'([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"')

_COMMENT_OPEN = "<!--"
_COMMENT_CLOSE = "-->"


@dataclass(frozen=True)
class Cell:
    """One thing the document is made of, and what it says it is.

    `kind` is the cell's identity and is never inferred from its text — a chapter
    called "Disclaimer" is still a chapter. `attrs` is whatever the kind needs
    said about it, and is kept even when this module has no use for it.
    """

    kind: str
    source: str = ""
    attrs: dict[str, str] = field(default_factory=dict)
    at: tuple[int, int] | None = field(default=None, compare=False)

    @property
    def title(self) -> str:
        return self.attrs.get("title", "")

    @property
    def unique_id(self) -> str:
        return self.attrs.get("id", "")

    def offset_of(self, line: int, character: int) -> int:
        assert self.at is not None
        above = self.source.splitlines()[: line - self.at[0]]
        return sum(len(written) + 1 for written in above) + character

    def with_source(self, source: str) -> "Cell":
        return replace(self, source=source)


def parse(text: str) -> list[Cell]:
    cells: list[Cell] = []
    kind, attrs, body, first = MARKDOWN, {}, [], 0
    opened = False

    def close() -> None:
        # `dumps` strips blank lines off both ends of a cell's text, so the lines
        # it occupies are the ones between the outermost non-blank ones.
        written = [i for i, line in enumerate(body) if line != ""]
        source = "\n".join(body).strip("\n")
        # A marker opens a cell, so the run of text above the first one belongs
        # to no cell and is dropped — as the editor's reader drops it.
        if opened:
            at = (first + written[0], first + written[-1]) if written else None
            cells.append(Cell(kind, source, dict(attrs), at))

    # Split on "\n" alone, as the editor's reader does: a form feed or a
    # U+2028 is a character the author wrote, not a line the document has.
    for index, line in enumerate(text.split("\n")):
        marker = _MARKER.match(line)
        if not marker:
            body.append(line)
            continue
        close()
        opened = True
        kind = marker.group(1)
        attrs = _read_attrs(marker.group(2))
        body = []
        first = index + 1
    close()
    return cells


def dumps(cells: list[Cell]) -> str:
    """The document as text, such that `parse(dumps(cells)) == cells`."""
    out: list[str] = []
    for cell in cells:
        out.append(_marker_for(cell))
        out.append("")
        if cell.source:
            out.append(cell.source)
            out.append("")
    return "\n".join(out)


def load(path: Path) -> list[Cell]:
    return parse(path.read_text(encoding="utf-8"))


def save(path: Path, cells: list[Cell]) -> None:
    path.write_text(dumps(cells), encoding="utf-8")


def cells_of(cells: list[Cell], kind: str) -> list[Cell]:
    return [cell for cell in cells if cell.kind == kind]


def add_missing(cells: list[Cell], wanted: list[Cell]) -> list[Cell]:
    added_cells = list(cells)
    for cell in wanted:
        if not any(added_cell.kind == cell.kind for added_cell in added_cells):
            added_cells.append(cell)
    return added_cells


def markdown(source: str) -> Cell:
    return Cell(MARKDOWN, source)


def chapter(title: str) -> Cell:
    return Cell(CHAPTER, "", {"title": title})


def part(title: str, printed: bool = True) -> Cell:
    return Cell(PART, "", {"title": title} if printed else {"title": title, PRINT: NO})


def prints_page(cell: Cell) -> bool:
    return cell.attrs.get(PRINT, "") != NO


def image(src: str, full_page: bool = True) -> Cell:
    return Cell(IMAGE, "", {"src": src} if full_page else {"src": src, FULL_PAGE: NO})


def is_full_page(cell: Cell) -> bool:
    return cell.attrs.get(FULL_PAGE, "") != NO


def contents() -> Cell:
    return Cell(CONTENTS)


def _split_comments(lines: list[str], line_indices: list[int]) -> list[tuple[int, int]]:
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

BUILT_KINDS = frozenset({CONTENTS})
PRIVATE_KINDS = frozenset({BLURB, NOTE, RECAP})


def _prose_of(lines: list[tuple[int, str]]) -> str:
    written: list[str] = []
    previous: int | None = None
    for index, said in lines:
        if previous is not None and index != previous + 1:
            written.append("")
        written.append(said)
        previous = index
    return "\n".join(written)


class Document:
    """An .author document"""

    def __init__(self, text: str, path: Path | None = None) -> None:
        self.path = path
        self._read(text)

    def _read(self, text: str) -> None:
        self.text = text
        self.lines = text.splitlines()
        self.cells = parse(text)

    @classmethod
    def load(cls, path: Path) -> "Document":
        return cls(path.read_text(encoding="utf-8"), path)

    @property
    def title(self) -> str:
        """What the book is called, which only the title page says."""
        for cell in self.cells:
            if cell.kind == TITLE_PAGE and cell.title:
                return cell.title
        return "Anonymous"

    def story_lines(
        self, start: int = 0, end: int | None = None
    ) -> Iterator[tuple[int, str]]:
        last = len(self.lines) - 1 if end is None else end
        for cell in self.cells:
            if cell.at is None or cell.kind in BUILT_KINDS:
                continue
            first, final = cell.at
            covered = list(range(first, final + 1))
            # A cell's prose may carry the author's own notes, and those are no
            # more story than the markers around them.
            for kept_first, kept_last in _split_comments(
                [self.lines[i] for i in covered], covered
            ):
                for index in range(max(kept_first, start), min(kept_last, last) + 1):
                    said = self.lines[index].strip()
                    if said:
                        yield index, said

    @property
    def chapters(self) -> list[tuple[str, str]]:
        """The raw contents of chapters - stripped of comments and any other information"""
        found: list[tuple[str, list[tuple[int, str]]]] = []
        for cell in self.cells:
            if cell.kind == CHAPTER:
                found.append((cell.title or f"Chapter {len(found) + 1}", []))
            elif found and cell.at and cell.kind not in PRIVATE_KINDS:
                found[-1][1].extend(self.story_lines(*cell.at))
        return [(title, _prose_of(lines)) for title, lines in found if lines]

    def __str__(self) -> str:
        return self.text

    def cell_at(self, line: int) -> Cell | None:
        """The cell `line` falls in."""
        for cell in self.cells:
            if cell.at and cell.at[0] <= line <= cell.at[1]:
                return cell
        return None

    def lines_at(self, line: int) -> tuple[int, int] | None:
        """The lines of the cell that `line` falls in — what to correct when the
        author names a cursor rather than a selection."""
        cell = self.cell_at(line)
        return cell.at if cell else None

    def beside(self, suffix: str) -> Path:
        """A file named after this one — `story.author` gives `story.epub`."""
        assert self.path is not None
        return self.path.with_suffix(suffix)

    def delete(self, start: int, end: int) -> None:
        """Take out lines `start` to `end`, both included."""
        lines = list(self.lines)
        del lines[start : end + 1]
        self._rewrite(lines)

    def insert(self, at: int, text: str) -> None:
        """Put `text` in as whole lines, the first landing on line `at`."""
        lines = list(self.lines)
        lines[at:at] = text.splitlines()
        self._rewrite(lines)

    def _rewrite(self, lines: list[str]) -> None:
        # Where the cells fall is a reading of the lines, so a document that has
        # been written in is read again rather than adjusted.
        ends_with_newline = self.text.endswith("\n")
        self._read("\n".join(lines) + ("\n" if ends_with_newline else ""))


def _read_attrs(text: str) -> dict[str, str]:
    return {
        name: _unescape(value) for name, value in _ATTR.findall(text)
    }


def _marker_for(cell: Cell) -> str:
    said = "".join(
        f' {name}="{_escape(value)}"' for name, value in cell.attrs.items()
    )
    return f"<!-- cell: {cell.kind}{said} -->"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _unescape(value: str) -> str:
    return re.sub(r"\\(.)", r"\1", value)
