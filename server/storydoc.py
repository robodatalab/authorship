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
from dataclasses import dataclass, field, replace
from pathlib import Path

EXTENSION = ".author"

MARKDOWN = "markdown"
CHAPTER = "chapter"
TITLE_PAGE = "title-page"
COVER = "cover"
CONTENTS = "contents"
DISCLAIMER = "disclaimer"
ABOUT = "about"

_MARKER = re.compile(r"^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$")
_ATTR = re.compile(r'([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"')


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


def cover(src: str, alt: str = "Cover") -> Cell:
    return Cell(COVER, f"![{alt}]({src})", {"src": src})


def contents() -> Cell:
    """The table of contents, built at export from the chapters around it."""
    return Cell(CONTENTS)


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
