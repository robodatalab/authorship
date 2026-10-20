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

from pathlib import Path

from server.storydoc.cells.cell import Cell
from server.storydoc.cells.plot_cell import PlotCell
from server.storydoc.cells.salient_concept_cell import SalientConceptCell
from server.storydoc.cells.title_page_cell import TitlePageCell
from server.storydoc.parser import marker_for, parse
from server.storydoc.visitors.marker_attributes import MarkerAttributes

EXTENSION = ".author"


class Document:
    """An .author document"""

    def __init__(self, text: str, path: Path | None = None) -> None:
        self.path = path
        self.cells = parse(text)

    @classmethod
    def from_cells(cls, cells: list[Cell], path: Path | None = None) -> Document:
        written = cls("", path)
        written.cells = list(cells)
        return cls(written.text, path)

    @property
    def text(self) -> str:
        """The document as text, such that `parse(text) == cells`."""
        marker_attributes = MarkerAttributes()
        out: list[str] = []
        for cell in self.cells:
            marker = marker_for(cell, marker_attributes)
            out.append(marker)
            out.append("")
            if cell.source:
                out.append(cell.source)
                out.append("")
        return "\n".join(out)

    @property
    def lines(self) -> list[str]:
        return self.text.splitlines()

    @classmethod
    def load(cls, path: Path) -> "Document":
        return cls(path.read_text(encoding="utf-8"), path)

    def save(self) -> None:
        assert self.path is not None
        self.path.write_text(self.text, encoding="utf-8")

    @property
    def title_page(self) -> TitlePageCell:
        """What the book says of itself, blank in a document that says nothing."""
        return next(
            (cell for cell in self.cells if isinstance(cell, TitlePageCell)),
            TitlePageCell(),
        )

    @property
    def title(self) -> str:
        return self.title_page.title or "Anonymous"

    def cell_with_id(self, cell_id: str) -> Cell | None:
        return next((cell for cell in self.cells if cell.unique_id == cell_id), None)

    def salient_concepts(self) -> list[SalientConceptCell]:
        return [cell for cell in self.cells if isinstance(cell, SalientConceptCell)]

    def plots(self) -> list[PlotCell]:
        return [cell for cell in self.cells if isinstance(cell, PlotCell)]

    def __str__(self) -> str:
        return self.text

    def cell_at(self, line: int) -> Cell | None:
        """The cell `line` falls in."""
        for cell in self.cells:
            if cell.at and cell.at[0] <= line <= cell.at[1]:
                return cell
        return None
