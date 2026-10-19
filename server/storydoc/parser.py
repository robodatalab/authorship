from __future__ import annotations

import re
from uuid import uuid4

from server.storydoc.cells.cell import Cell
from server.storydoc.cells.about_cell import ABOUT, AboutCell
from server.storydoc.cells.blurb_cell import BLURB, BlurbCell
from server.storydoc.cells.chapter_cell import CHAPTER, ChapterCell
from server.storydoc.cells.disclaimer_cell import DISCLAIMER, DisclaimerCell
from server.storydoc.cells.divider_cell import DIVIDER, DividerCell
from server.storydoc.cells.image_cell import IMAGE, ImageCell
from server.storydoc.cells.markdown_cell import MARKDOWN, MarkdownCell
from server.storydoc.cells.note_cell import NOTE, NoteCell
from server.storydoc.cells.part_cell import PART, PartCell
from server.storydoc.cells.plot_cell import PLOT, PlotCell
from server.storydoc.cells.plot_edge import PlotEdge
from server.storydoc.cells.plot_node import PlotNode
from server.storydoc.cells.recap_cell import RECAP, RecapCell
from server.storydoc.cells.salient_concept_cell import (
    SALIENT_CONCEPT,
    SalientConceptCell,
)
from server.storydoc.cells.table_of_contents_cell import (
    TABLE_OF_CONTENTS,
    TableOfContentsCell,
)
from server.storydoc.cells.title_page_cell import TITLE_PAGE, TitlePageCell
from server.storydoc.cells.story_word_range import StoryWordRange
from server.storydoc.cells.unknown_cell import UnknownCell
from server.storydoc.visitors.marker_attributes import (
    AUTHOR,
    COVER_DESIGNER,
    DATE,
    DOCUMENTS,
    FULL_PAGE,
    ISBN,
    KDP,
    LANGUAGE,
    NO,
    PLOT_EDGES,
    PLOT_NODES,
    PORTRAIT,
    PUBLISHER,
    SRC,
    STORY_WORD_RANGES,
    SUBSTACK,
    SUBTITLE,
    TITLE,
    VERSION,
    WEBSITE,
    MarkerAttributes,
)

_UNIQUE_ID = "id"
FOLDED = "folded"
_TRUE = "true"

_MARKER = re.compile(r"^<!--\s*cell:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*(.*?)\s*-->\s*$")
_ATTR = re.compile(r'([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"')

_STORY_WORD_RANGE = re.compile(r"^\s*(\d+)-(\d+)\s*$")

_PLOT_NODE = re.compile(r"^\s*([^:\s]+):(\d+)-(\d+)\s*$")
_PLOT_EDGE = re.compile(r"^\s*([^:\s]+):([^>\s]+)>(\S+)\s*$")

_COMMENT_OPEN = "<!--"
_COMMENT_CLOSE = "-->"


def parse(text: str) -> list[Cell]:
    cells: list[Cell] = []
    kind, attrs, body, first, unique_id, folded = MARKDOWN, {}, [], 0, "", False
    opened = False

    def close() -> None:
        # `Document.text` strips blank lines off both ends of a cell's text, so
        # the lines it occupies are the ones between the outermost non-blank ones.
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
        folded = attrs.pop(FOLDED, "") == _TRUE
        body = []
        first = index + 1
    close()
    return cells


def cell_of_kind(kind: str) -> Cell:
    unique_id = str(uuid4())
    return _cell_from_marker(kind, {}, "", False, None, unique_id)


def _read_attrs(text: str) -> dict[str, str]:
    return {
        name: _unescape(value) for name, value in _ATTR.findall(text)
    }


def _unescape(value: str) -> str:
    return re.sub(r"\\(.)", r"\1", value)


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
        return ChapterCell(attrs.get(TITLE, ""), source, folded, at, unique_id)
    if kind == PART:
        return PartCell(attrs.get(TITLE, ""), source, folded, at, unique_id)
    if kind == DIVIDER:
        return DividerCell(source, folded, at, unique_id)
    if kind == TITLE_PAGE:
        return TitlePageCell(
            attrs.get(TITLE, ""),
            attrs.get(SUBTITLE, ""),
            attrs.get(AUTHOR, ""),
            attrs.get(PUBLISHER, ""),
            attrs.get(DATE, ""),
            attrs.get(VERSION, ""),
            attrs.get(ISBN, ""),
            attrs.get(COVER_DESIGNER, ""),
            attrs.get(LANGUAGE, ""),
            source,
            folded,
            at,
            unique_id,
        )
    if kind == IMAGE:
        return ImageCell(
            attrs.get(SRC, ""),
            attrs.get(FULL_PAGE) != NO,
            source,
            folded,
            at,
            unique_id,
        )
    if kind == TABLE_OF_CONTENTS:
        return TableOfContentsCell(source, folded, at, unique_id)
    if kind == DISCLAIMER:
        return DisclaimerCell(attrs.get(TITLE, ""), source, folded, at, unique_id)
    if kind == ABOUT:
        return AboutCell(
            attrs.get(KDP, ""),
            attrs.get(WEBSITE, ""),
            attrs.get(SUBSTACK, ""),
            attrs.get(PORTRAIT, ""),
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
        return RecapCell(attrs.get(DOCUMENTS, ""), source, folded, at, unique_id)
    if kind == SALIENT_CONCEPT:
        story_word_ranges = _story_word_ranges_in(attrs.get(STORY_WORD_RANGES, ""))
        return SalientConceptCell(
            attrs.get(TITLE, ""), story_word_ranges, source, folded, at, unique_id
        )
    if kind == PLOT:
        nodes = _plot_nodes_in(attrs.get(PLOT_NODES, ""))
        edges = _plot_edges_in(attrs.get(PLOT_EDGES, ""))
        return PlotCell(
            attrs.get(TITLE, ""), nodes, edges, source, folded, at, unique_id
        )
    return UnknownCell(kind, attrs, source, folded, at, unique_id)


def split_comments(lines: list[str], line_indices: list[int]) -> list[tuple[int, int]]:
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


def marker_for(cell: Cell, marker_attributes: MarkerAttributes) -> str:
    attributes_of_the_kind = cell.accept(marker_attributes)
    folded = {FOLDED: _TRUE} if cell.folded else {}
    written_attrs = {_UNIQUE_ID: cell.unique_id, **attributes_of_the_kind, **folded}
    said = "".join(
        f' {name}="{_escape(value)}"' for name, value in written_attrs.items()
    )
    return f"<!-- cell: {cell.kind}{said} -->"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
