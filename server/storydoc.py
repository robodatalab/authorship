"""A story and the layout it is published in, in one human-readable file.

The file is `<name>.author`, and it is markdown. What makes it a story document
is that the markdown is cut into cells, each opened by a marker that says what
the cell *is*:

    <!-- cell: chapter title="The First Night" -->

    The lantern had gone out again.

    <!-- cell: cover src="art/cover.jpg" -->

    ![Cover](art/cover.jpg)

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
COVER = "cover"
CONTENTS = "contents"
DISCLAIMER = "disclaimer"
ABOUT = "about"
BLURB = "blurb"
NOTE = "note"

# What an attribute says when the answer to it is no, and the attribute a part
# says it of: whether the book prints a page where the part stands.
NO = "no"
PRINT = "print"

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

    @property
    def title(self) -> str:
        return self.attrs.get("title", "")

    def with_source(self, source: str) -> "Cell":
        return replace(self, source=source)


def parse(text: str) -> list[Cell]:
    cells: list[Cell] = []
    kind = MARKDOWN
    attrs: dict[str, str] = {}
    body: list[str] = []

    def close() -> None:
        source = "\n".join(body).strip("\n")
        # The run of text above the first marker is only a cell if the author
        # wrote something there; a document that opens with a marker does not
        # start with an empty one.
        if source or cells or attrs or kind != MARKDOWN:
            cells.append(Cell(kind, source, dict(attrs)))

    for line in text.splitlines():
        marker = _MARKER.match(line)
        if not marker:
            body.append(line)
            continue
        close()
        kind = marker.group(1)
        attrs = _read_attrs(marker.group(2))
        body = []
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


def has(cells: list[Cell], kind: str) -> bool:
    """Whether the document already carries a cell of this kind.

    This is what keeps *prepare for publishing* from laying a second title page
    over the one the author already wrote or edited.
    """
    return any(cell.kind == kind for cell in cells)


def add_missing(cells: list[Cell], wanted: list[Cell]) -> list[Cell]:
    """Add each wanted cell the document does not already have, in order.

    Kind is the identity, so a cell the author has since rewritten still counts
    as present and is left exactly as they left it.
    """
    added = list(cells)
    for cell in wanted:
        if not has(added, cell.kind):
            added.append(cell)
    return added


def markdown(source: str) -> Cell:
    return Cell(MARKDOWN, source)


def chapter(title: str) -> Cell:
    """A named place in the book and nothing else.

    The prose beneath a chapter is markdown cells, as prose is everywhere else,
    so a chapter carries a title and no source of its own.
    """
    return Cell(CHAPTER, "", {"title": title})


def part(title: str, printed: bool = True) -> Cell:
    """A named division of the story, gathering the chapters that follow it.

    The same bargain a chapter strikes, one level up: it names a run of chapters
    and carries no prose of its own.
    """
    return Cell(PART, "", {"title": title} if printed else {"title": title, PRINT: NO})


def prints_page(cell: Cell) -> bool:
    """Whether a part is a page the reader turns to, or only a seam in the story.

    A part does two jobs and they are not the same one. It names a run of
    chapters — the tale, in a book of tales — and it says where the story may be
    cut into files. An author who wants the second without the first marks the
    part unprinted: it divides the story exactly as any other part does, and the
    book goes out with no page where it stands.

    Saying nothing is printing, so a part written before there was anything to
    say about this is the page it has always been. Mirrors `printsPage` in
    `extension/storydoc/model.ts`.
    """
    return cell.attrs.get(PRINT, "") != NO


def cover(src: str, alt: str = "Cover") -> Cell:
    return Cell(COVER, f"![{alt}]({src})", {"src": src})


def contents() -> Cell:
    """The table of contents, built at export from the chapters around it."""
    return Cell(CONTENTS)


def _split_comments(lines: list[str], line_indices: list[int]) -> list[tuple[int, int]]:
    """The stretches of those lines that are not the author's notes.

    A note is `<!-- -->`, which is also what a cell marker is written as — so
    this is the same rule keeping the structure out of the story and keeping the
    author's asides out of it. Given indices as well as lines, so it can answer
    about a stretch of a file rather than only about a whole one."""
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


# Built from the rest of the document rather than written, so never prose anyone
# corrects or searches. Mirrors `automated` in the editor's own model.
BUILT_KINDS = frozenset({CONTENTS})

# Kept in the working document and printed in no book. What the author writes
# *about* the story — the blurb for a shop page, a covering letter, a note on
# where the plot is going — belongs beside it and never inside it, so it is
# written here and published nowhere.
PRIVATE_KINDS = frozenset({BLURB, NOTE})


@dataclass(frozen=True)
class Placed:
    """A cell and where its text sits in the file, 0-based and inclusive.

    The server works in line numbers — correcting a passage means naming the
    lines it is on, and a search result is a run of them — so a cell has to be
    able to say where it is. `at` is None for a cell with no text of its own.
    """

    cell: Cell
    at: tuple[int, int] | None


def place(text: str) -> list[Placed]:
    """Every cell, with the lines its text occupies."""
    placed: list[Placed] = []
    kind, attrs, body, first = MARKDOWN, {}, [], 0

    def close() -> None:
        # `dumps` strips blank lines off both ends of a cell's text, so the lines
        # it occupies are the ones between the outermost non-blank ones.
        written = [i for i, line in enumerate(body) if line != ""]
        source = "\n".join(body).strip("\n")
        if not (source or placed or attrs or kind != MARKDOWN):
            return
        at = (first + written[0], first + written[-1]) if written else None
        placed.append(Placed(Cell(kind, source, dict(attrs)), at))

    for index, line in enumerate(text.splitlines()):
        marker = _MARKER.match(line)
        if not marker:
            body.append(line)
            continue
        close()
        kind, attrs, body, first = marker.group(1), _read_attrs(marker.group(2)), [], index + 1
    close()
    return placed


class Document:
    """A story document, and the file it is written in.

    Everything the server does to a story it does through this: the prose it can
    correct, the lines it can search, the chapters it can bind into a book. The
    structure comes from the cells, so a heading in the prose is prose — which is
    the whole reason the format marks its structure rather than inferring it.
    """

    def __init__(self, text: str, path: Path | None = None) -> None:
        self.path = path
        self._read(text)

    def _read(self, text: str) -> None:
        self.text = text
        self.lines = text.splitlines()
        self.placed = place(text)
        self.cells = [p.cell for p in self.placed]

    @classmethod
    def load(cls, path: Path) -> "Document":
        return cls(path.read_text(encoding="utf-8"), path)

    def save(self, path: Path | None = None) -> None:
        target = path or self.path
        assert target is not None
        target.write_text(self.text, encoding="utf-8")

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
        """The lines that are prose, by their number in the file.

        The markers are not among them, nor is anything in a cell the document
        writes for itself — asking a model to correct a table of contents would
        be asking it to disagree with the chapters.
        """
        last = len(self.lines) - 1 if end is None else end
        for placed in self.placed:
            if placed.at is None or placed.cell.kind in BUILT_KINDS:
                continue
            first, final = placed.at
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

    def chapters(self) -> list[tuple[str, list[str]]]:
        """Each chapter and the prose written under it.

        A chapter cell opens one; the prose cells after it belong to it until the
        next chapter opens. What stands before the first chapter is front matter
        and belongs to no chapter at all.
        """
        found: list[tuple[str, list[str]]] = []
        for cell in self.cells:
            if cell.kind == CHAPTER:
                found.append((cell.title or f"Chapter {len(found) + 1}", []))
            elif found and cell.source and cell.kind not in BUILT_KINDS:
                body = found[-1][1]
                if body:
                    body.append("")
                body.extend(cell.source.splitlines())
        return found

    def __str__(self) -> str:
        return self.text

    def lines_at(self, line: int) -> tuple[int, int] | None:
        """The lines of the cell that `line` falls in — what to correct when the
        author names a cursor rather than a selection."""
        for placed in self.placed:
            if placed.at and placed.at[0] <= line <= placed.at[1]:
                return placed.at
        return None

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
