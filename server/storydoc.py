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
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Generic, TypeVar
from uuid import uuid4

EXTENSION = ".author"

MARKDOWN = "markdown"
CHAPTER = "chapter"
PART = "part"
DIVIDER = "divider"
TITLE_PAGE = "title-page"
IMAGE = "image"
TABLE_OF_CONTENTS = "contents"
DISCLAIMER = "disclaimer"
ABOUT = "about"
BLURB = "blurb"
NOTE = "note"
RECAP = "recap"
SALIENT_CONCEPT = "salient-concept"
PLOT = "plot"

# What an attribute says when the answer to it is no.
NO = "no"

FULL_PAGE = "full-page"

_UNIQUE_ID = "id"
_FOLDED = "folded"
_TRUE = "true"

_TITLE = "title"
_SUBTITLE = "subtitle"
_AUTHOR = "author"
_PUBLISHER = "publisher"
_DATE = "date"
_VERSION = "version"
_ISBN = "isbn"
_COVER_DESIGNER = "cover-designer"
_LANGUAGE = "language"
_SRC = "src"
_KDP = "kdp"
_WEBSITE = "website"
_SUBSTACK = "substack"
_PORTRAIT = "portrait"
_DOCUMENTS = "documents"

_MARKER = re.compile(r"^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$")
_ATTR = re.compile(r'([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"')

_COMMENT_OPEN = "<!--"
_COMMENT_CLOSE = "-->"

STORY_WORD_RANGES = "words"

_STORY_WORD_RANGE = re.compile(r"^\s*(\d+)-(\d+)\s*$")

_STORY_WORD = re.compile(r"\S+")
_WORD_CHARACTER = re.compile(r"\w", re.ASCII)

PLOT_NODES = "nodes"
PLOT_EDGES = "edges"

_PLOT_NODE = re.compile(r"^\s*([^:\s]+):(\d+)-(\d+)\s*$")
_PLOT_EDGE = re.compile(r"^\s*([^:\s]+):([^>\s]+)>(\S+)\s*$")


@dataclass(frozen=True)
class StoryWordRange:
    first_word: int
    last_word: int


@dataclass(frozen=True)
class PlotNode:
    node_id: str
    story_word_range: StoryWordRange


@dataclass(frozen=True)
class PlotEdge:
    edge_id: str
    from_node_id: str
    to_node_id: str


_Result = TypeVar("_Result")


class CellVisitor(ABC, Generic[_Result]):
    @abstractmethod
    def visit_markdown(self, cell: MarkdownCell) -> _Result: ...

    @abstractmethod
    def visit_chapter(self, cell: ChapterCell) -> _Result: ...

    @abstractmethod
    def visit_part(self, cell: PartCell) -> _Result: ...

    @abstractmethod
    def visit_divider(self, cell: DividerCell) -> _Result: ...

    @abstractmethod
    def visit_title_page(self, cell: TitlePageCell) -> _Result: ...

    @abstractmethod
    def visit_image(self, cell: ImageCell) -> _Result: ...

    @abstractmethod
    def visit_table_of_contents(self, cell: TableOfContentsCell) -> _Result: ...

    @abstractmethod
    def visit_disclaimer(self, cell: DisclaimerCell) -> _Result: ...

    @abstractmethod
    def visit_about(self, cell: AboutCell) -> _Result: ...

    @abstractmethod
    def visit_blurb(self, cell: BlurbCell) -> _Result: ...

    @abstractmethod
    def visit_note(self, cell: NoteCell) -> _Result: ...

    @abstractmethod
    def visit_recap(self, cell: RecapCell) -> _Result: ...

    @abstractmethod
    def visit_salient_concept(self, cell: SalientConceptCell) -> _Result: ...

    @abstractmethod
    def visit_plot(self, cell: PlotCell) -> _Result: ...

    @abstractmethod
    def visit_unknown(self, cell: UnknownCell) -> _Result: ...


class Cell(ABC):
    """One thing the document is made of, and what it says it is.

    `kind` is the cell's identity and is never inferred from its text — a chapter
    called "Disclaimer" is still a chapter.
    """

    kind: str
    source: str
    folded: bool
    at: tuple[int, int] | None
    _unique_id: str

    @property
    def unique_id(self) -> str:
        return self._unique_id

    def offset_of(self, line: int, character: int) -> int:
        assert self.at is not None
        above = self.source.splitlines()[: line - self.at[0]]
        return sum(len(written) + 1 for written in above) + character

    @abstractmethod
    def with_source(self, source: str) -> Cell: ...

    @abstractmethod
    def accept(self, visitor: CellVisitor[_Result]) -> _Result: ...


@dataclass(frozen=True)
class MarkdownCell(Cell):
    kind: str = field(default=MARKDOWN, init=False)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> MarkdownCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_markdown(self)


@dataclass(frozen=True)
class ChapterCell(Cell):
    kind: str = field(default=CHAPTER, init=False)
    title: str = ""
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> ChapterCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_chapter(self)


@dataclass(frozen=True)
class PartCell(Cell):
    kind: str = field(default=PART, init=False)
    title: str = ""
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> PartCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_part(self)


@dataclass(frozen=True)
class DividerCell(Cell):
    kind: str = field(default=DIVIDER, init=False)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> DividerCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_divider(self)


@dataclass(frozen=True)
class TitlePageCell(Cell):
    kind: str = field(default=TITLE_PAGE, init=False)
    title: str = ""
    subtitle: str = ""
    author: str = ""
    publisher: str = ""
    date: str = ""
    version: str = ""
    isbn: str = ""
    cover_designer: str = ""
    language: str = ""
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> TitlePageCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_title_page(self)


@dataclass(frozen=True)
class ImageCell(Cell):
    kind: str = field(default=IMAGE, init=False)
    src: str = ""
    full_page: bool = True
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> ImageCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_image(self)


@dataclass(frozen=True)
class TableOfContentsCell(Cell):
    kind: str = field(default=TABLE_OF_CONTENTS, init=False)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> TableOfContentsCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_table_of_contents(self)


@dataclass(frozen=True)
class DisclaimerCell(Cell):
    kind: str = field(default=DISCLAIMER, init=False)
    title: str = ""
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> DisclaimerCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_disclaimer(self)


@dataclass(frozen=True)
class AboutCell(Cell):
    kind: str = field(default=ABOUT, init=False)
    kdp: str = ""
    website: str = ""
    substack: str = ""
    portrait: str = ""
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> AboutCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_about(self)


@dataclass(frozen=True)
class BlurbCell(Cell):
    kind: str = field(default=BLURB, init=False)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> BlurbCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_blurb(self)


@dataclass(frozen=True)
class NoteCell(Cell):
    kind: str = field(default=NOTE, init=False)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> NoteCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_note(self)


@dataclass(frozen=True)
class RecapCell(Cell):
    kind: str = field(default=RECAP, init=False)
    documents: str = ""
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> RecapCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_recap(self)


@dataclass(frozen=True)
class SalientConceptCell(Cell):
    kind: str = field(default=SALIENT_CONCEPT, init=False)
    title: str = ""
    story_word_ranges: list[StoryWordRange] = field(default_factory=list)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> SalientConceptCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_salient_concept(self)


@dataclass(frozen=True)
class PlotCell(Cell):
    kind: str = field(default=PLOT, init=False)
    title: str = ""
    nodes: list[PlotNode] = field(default_factory=list)
    edges: list[PlotEdge] = field(default_factory=list)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> PlotCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_plot(self)


@dataclass(frozen=True)
class UnknownCell(Cell):
    kind: str
    attrs: dict[str, str] = field(default_factory=dict)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> UnknownCell:
        return replace(self, source=source)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_unknown(self)


def parse(text: str) -> list[Cell]:
    cells: list[Cell] = []
    kind, attrs, body, first, unique_id, folded = MARKDOWN, {}, [], 0, "", False
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
            cell = _cell_from_marker(kind, dict(attrs), source, folded, at, unique_id)
            cells.append(cell)

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
        unique_id = attrs.pop(_UNIQUE_ID, "") or str(uuid4())
        folded = attrs.pop(_FOLDED, "") == _TRUE
        body = []
        first = index + 1
    close()
    return cells


def dumps(cells: list[Cell]) -> str:
    """The document as text, such that `parse(dumps(cells)) == cells`."""
    marker_attributes = _MarkerAttributes()
    out: list[str] = []
    for cell in cells:
        marker = _marker_for(cell, marker_attributes)
        out.append(marker)
        out.append("")
        if cell.source:
            out.append(cell.source)
            out.append("")
    return "\n".join(out)


def load(path: Path) -> list[Cell]:
    return parse(path.read_text(encoding="utf-8"))


def save(path: Path, cells: list[Cell]) -> None:
    path.write_text(dumps(cells), encoding="utf-8")


def add_missing(cells: list[Cell], wanted: list[Cell]) -> list[Cell]:
    added_cells = list(cells)
    for cell in wanted:
        if not any(added_cell.kind == cell.kind for added_cell in added_cells):
            added_cells.append(cell)
    return added_cells


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


def _story_word_ranges_in(written: str) -> list[StoryWordRange]:
    story_word_ranges: list[StoryWordRange] = []
    for written_range in written.split(","):
        read_range = _STORY_WORD_RANGE.match(written_range)
        if read_range is None:
            continue
        first_word = int(read_range.group(1))
        last_word = int(read_range.group(2))
        story_word_range = StoryWordRange(first_word, last_word)
        story_word_ranges.append(story_word_range)
    return story_word_ranges


def _plot_nodes_in(written: str) -> list[PlotNode]:
    nodes: list[PlotNode] = []
    for written_node in written.split(","):
        read_node = _PLOT_NODE.match(written_node)
        if read_node is None:
            continue
        first_word = int(read_node.group(2))
        last_word = int(read_node.group(3))
        story_word_range = StoryWordRange(first_word, last_word)
        node = PlotNode(read_node.group(1), story_word_range)
        nodes.append(node)
    return nodes


def _plot_edges_in(written: str) -> list[PlotEdge]:
    edges: list[PlotEdge] = []
    for written_edge in written.split(","):
        read_edge = _PLOT_EDGE.match(written_edge)
        if read_edge is None:
            continue
        edge = PlotEdge(read_edge.group(1), read_edge.group(2), read_edge.group(3))
        edges.append(edge)
    return edges


def _cell_from_marker(
    kind: str,
    attrs: dict[str, str],
    source: str,
    folded: bool,
    at: tuple[int, int] | None,
    unique_id: str,
) -> Cell:
    if kind == MARKDOWN:
        return MarkdownCell(source, folded, at, unique_id)
    if kind == CHAPTER:
        return ChapterCell(attrs.get(_TITLE, ""), source, folded, at, unique_id)
    if kind == PART:
        return PartCell(attrs.get(_TITLE, ""), source, folded, at, unique_id)
    if kind == DIVIDER:
        return DividerCell(source, folded, at, unique_id)
    if kind == TITLE_PAGE:
        return TitlePageCell(
            attrs.get(_TITLE, ""),
            attrs.get(_SUBTITLE, ""),
            attrs.get(_AUTHOR, ""),
            attrs.get(_PUBLISHER, ""),
            attrs.get(_DATE, ""),
            attrs.get(_VERSION, ""),
            attrs.get(_ISBN, ""),
            attrs.get(_COVER_DESIGNER, ""),
            attrs.get(_LANGUAGE, ""),
            source,
            folded,
            at,
            unique_id,
        )
    if kind == IMAGE:
        return ImageCell(
            attrs.get(_SRC, ""),
            attrs.get(FULL_PAGE) != NO,
            source,
            folded,
            at,
            unique_id,
        )
    if kind == TABLE_OF_CONTENTS:
        return TableOfContentsCell(source, folded, at, unique_id)
    if kind == DISCLAIMER:
        return DisclaimerCell(attrs.get(_TITLE, ""), source, folded, at, unique_id)
    if kind == ABOUT:
        return AboutCell(
            attrs.get(_KDP, ""),
            attrs.get(_WEBSITE, ""),
            attrs.get(_SUBSTACK, ""),
            attrs.get(_PORTRAIT, ""),
            source,
            folded,
            at,
            unique_id,
        )
    if kind == BLURB:
        return BlurbCell(source, folded, at, unique_id)
    if kind == NOTE:
        return NoteCell(source, folded, at, unique_id)
    if kind == RECAP:
        return RecapCell(attrs.get(_DOCUMENTS, ""), source, folded, at, unique_id)
    if kind == SALIENT_CONCEPT:
        story_word_ranges = _story_word_ranges_in(attrs.get(STORY_WORD_RANGES, ""))
        return SalientConceptCell(
            attrs.get(_TITLE, ""), story_word_ranges, source, folded, at, unique_id
        )
    if kind == PLOT:
        nodes = _plot_nodes_in(attrs.get(PLOT_NODES, ""))
        edges = _plot_edges_in(attrs.get(PLOT_EDGES, ""))
        return PlotCell(
            attrs.get(_TITLE, ""), nodes, edges, source, folded, at, unique_id
        )
    return UnknownCell(kind, attrs, source, folded, at, unique_id)


class Document:
    """An .author document"""

    def __init__(self, text: str, path: Path | None = None) -> None:
        self.path = path
        self.cells = parse(text)

    @property
    def text(self) -> str:
        return dumps(self.cells)

    @property
    def lines(self) -> list[str]:
        return self.text.splitlines()

    @classmethod
    def load(cls, path: Path) -> "Document":
        return cls(path.read_text(encoding="utf-8"), path)

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

    def markdown_cells(self) -> list[MarkdownCell]:
        return [cell for cell in self.cells if isinstance(cell, MarkdownCell)]

    def cell_with_id(self, cell_id: str) -> Cell | None:
        return next((cell for cell in self.cells if cell.unique_id == cell_id), None)

    def story_lines(
        self, start: int = 0, end: int | None = None
    ) -> Iterator[tuple[int, str]]:
        """The story itself, line by line: the prose of the markdown cells,
        by the line of the document each is written on."""
        last = len(self.lines) - 1 if end is None else end
        for cell in self.cells:
            if cell.at is None or not isinstance(cell, MarkdownCell):
                continue
            first, final = cell.at
            covered = list(range(first, final + 1))
            # A cell's prose may carry the author's own notes, and those are no
            # more story than the markers around them.
            for kept_first, kept_last in _split_comments(
                [self.lines[i] for i in covered], covered
            ):
                for index in range(max(kept_first, start), min(kept_last, last) + 1):
                    if self.lines[index].strip():
                        yield index, self.lines[index]

    def story_text(self, start_word_idx: int, end_word_idx: int) -> str:
        texts_of_the_cells: list[str] = []
        words_before = 0
        for cell in self.markdown_cells():
            words_of_the_cell = [
                run
                for run in _STORY_WORD.finditer(cell.source)
                if _WORD_CHARACTER.search(run.group())
            ]
            covered = [
                word
                for word_idx, word in enumerate(words_of_the_cell, start=words_before)
                if start_word_idx <= word_idx <= end_word_idx
            ]
            words_before += len(words_of_the_cell)
            if covered:
                text_of_the_cell = cell.source[covered[0].start() : covered[-1].end()]
                texts_of_the_cells.append(text_of_the_cell)
        story_text = "\n\n".join(texts_of_the_cells)
        return story_text

    @property
    def chapters(self) -> list[tuple[str, str]]:
        """The raw contents of chapters - stripped of comments and any other information"""
        found: list[tuple[str, list[tuple[int, str]]]] = []
        for cell in self.cells:
            if isinstance(cell, ChapterCell):
                found.append((cell.title or f"Chapter {len(found) + 1}", []))
            elif found and cell.at:
                found[-1][1].extend(self.story_lines(*cell.at))

        chapter_lines: list[tuple[str, str]] = []
        for title, numbered_lines in found:
            unnumbered_lines = "\n".join([line for _, line in numbered_lines])
            chapter_lines.append((title, unnumbered_lines))

        return chapter_lines

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
        self.cells = parse("\n".join(lines) + ("\n" if ends_with_newline else ""))


def _read_attrs(text: str) -> dict[str, str]:
    return {
        name: _unescape(value) for name, value in _ATTR.findall(text)
    }


def _without_the_ones_nothing_is_said_about(
    attributes: dict[str, str],
) -> dict[str, str]:
    return {name: value for name, value in attributes.items() if value != ""}


def _written_story_word_ranges(story_word_ranges: list[StoryWordRange]) -> str:
    return ", ".join(
        f"{story_word_range.first_word}-{story_word_range.last_word}"
        for story_word_range in story_word_ranges
    )


def _written_plot_nodes(nodes: list[PlotNode]) -> str:
    return ", ".join(
        f"{node.node_id}:{node.story_word_range.first_word}"
        f"-{node.story_word_range.last_word}"
        for node in nodes
    )


def _written_plot_edges(edges: list[PlotEdge]) -> str:
    return ", ".join(
        f"{edge.edge_id}:{edge.from_node_id}>{edge.to_node_id}" for edge in edges
    )


class _MarkerAttributes(CellVisitor[dict[str, str]]):
    def visit_markdown(self, cell: MarkdownCell) -> dict[str, str]:
        return {}

    def visit_chapter(self, cell: ChapterCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({_TITLE: cell.title})

    def visit_part(self, cell: PartCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({_TITLE: cell.title})

    def visit_divider(self, cell: DividerCell) -> dict[str, str]:
        return {}

    def visit_title_page(self, cell: TitlePageCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about(
            {
                _TITLE: cell.title,
                _SUBTITLE: cell.subtitle,
                _AUTHOR: cell.author,
                _PUBLISHER: cell.publisher,
                _DATE: cell.date,
                _VERSION: cell.version,
                _ISBN: cell.isbn,
                _COVER_DESIGNER: cell.cover_designer,
                _LANGUAGE: cell.language,
            }
        )

    def visit_image(self, cell: ImageCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about(
            {_SRC: cell.src, FULL_PAGE: "" if cell.full_page else NO}
        )

    def visit_table_of_contents(self, cell: TableOfContentsCell) -> dict[str, str]:
        return {}

    def visit_disclaimer(self, cell: DisclaimerCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({_TITLE: cell.title})

    def visit_about(self, cell: AboutCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about(
            {
                _KDP: cell.kdp,
                _WEBSITE: cell.website,
                _SUBSTACK: cell.substack,
                _PORTRAIT: cell.portrait,
            }
        )

    def visit_blurb(self, cell: BlurbCell) -> dict[str, str]:
        return {}

    def visit_note(self, cell: NoteCell) -> dict[str, str]:
        return {}

    def visit_recap(self, cell: RecapCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({_DOCUMENTS: cell.documents})

    def visit_salient_concept(self, cell: SalientConceptCell) -> dict[str, str]:
        story_word_ranges = _written_story_word_ranges(cell.story_word_ranges)
        return _without_the_ones_nothing_is_said_about(
            {_TITLE: cell.title, STORY_WORD_RANGES: story_word_ranges}
        )

    def visit_plot(self, cell: PlotCell) -> dict[str, str]:
        nodes = _written_plot_nodes(cell.nodes)
        edges = _written_plot_edges(cell.edges)
        return _without_the_ones_nothing_is_said_about(
            {_TITLE: cell.title, PLOT_NODES: nodes, PLOT_EDGES: edges}
        )

    def visit_unknown(self, cell: UnknownCell) -> dict[str, str]:
        return dict(cell.attrs)


def _marker_for(cell: Cell, marker_attributes: _MarkerAttributes) -> str:
    attributes_of_the_kind = cell.accept(marker_attributes)
    folded = {_FOLDED: _TRUE} if cell.folded else {}
    written_attrs = {_UNIQUE_ID: cell.unique_id, **attributes_of_the_kind, **folded}
    said = "".join(
        f' {name}="{_escape(value)}"' for name, value in written_attrs.items()
    )
    return f"<!-- cell: {cell.kind}{said} -->"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _unescape(value: str) -> str:
    return re.sub(r"\\(.)", r"\1", value)
