from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, TypeVar
from uuid import uuid4

from server.storydoc.cells.cell import Cell
from server.storydoc.cells.story_word_range import StoryWordRange
from server.storydoc.written_attributes import attributes_in, written_attribute_value

if TYPE_CHECKING:
    from server.storydoc.cells.cell_visitor import CellVisitor

PLOT = "plot"

# A plot's body is its overview and its events, written to a rigid schema, one
# element to a line:
#
#     <ol title="How Captain Varn gave her life to buy her daughter time.">
#     <li id="e1" timestamp="1.1" location="earth, Varn's house" words="412-468">Captain Varn watches the news with her daughter.</li>
#     <li id="e2" timestamp="1.2" location="earth, command center">Varn is given command of the corvette.</li>
#     </ol>
#
# The attributes are written as a cell marker's are, and an event's summary is
# the rest of its line, up to the closing tag. The timestamps are a clock the
# whole manuscript shares, so a plot skips the moments nothing happens in it;
# the location runs from the broadest place to the most specific; and `words`
# are the story's words that tell the event, once there are any.
_ATTRIBUTES = r'((?:\s+[A-Za-z0-9][A-Za-z0-9_-]*\s*=\s*"(?:[^"\\]|\\.)*")*)\s*'
_EVENTS_OPENED = re.compile(rf"^<ol{_ATTRIBUTES}>$")
_EVENT = re.compile(rf"^<li{_ATTRIBUTES}>(.*)</li>$")
_EVENTS_CLOSED = "</ol>"
_EVENT_WORDS = re.compile(r"^(\d+)-(\d+)$")

_OVERVIEW = "title"
_EVENT_ID = "id"
_TIMESTAMP = "timestamp"
_LOCATION = "location"
_WORDS = "words"


@dataclass(frozen=True)
class PlotNode:
    node_id: str
    story_word_range: StoryWordRange | None
    timestamp: str = ""
    location: str = ""
    summary: str = ""


@dataclass(frozen=True)
class PlotEdge:
    edge_id: str
    from_node_id: str
    to_node_id: str

_Result = TypeVar("_Result")


@dataclass(frozen=True)
class PlotCell(Cell):
    kind: str = field(default=PLOT, init=False)
    title: str = ""
    nodes: list[PlotNode] = field(default_factory=list)
    edges: list[PlotEdge] = field(default_factory=list)
    overview: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    @property
    def source(self) -> str:  # type: ignore[override]
        return written_plot_body(self.overview, self.nodes)

    @classmethod
    def from_body(
        cls,
        title: str,
        edges: list[PlotEdge],
        body: str,
        folded: bool,
        at: tuple[int, int] | None,
        unique_id: str,
    ) -> PlotCell:
        """The plot whose body is `body`: its overview and events read from it."""
        overview, nodes = plot_body_read(body)
        return cls(title, nodes, edges, overview, folded, at, unique_id)

    def with_source(self, source: str) -> PlotCell:
        overview, nodes = plot_body_read(source)
        return replace(self, overview=overview, nodes=nodes)

    def with_folded(self, folded: bool) -> PlotCell:
        return replace(self, folded=folded)

    def with_overview(self, overview: str) -> PlotCell:
        return replace(self, overview=overview)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_plot(self)


def written_plot_body(overview: str, nodes: list[PlotNode]) -> str:
    """A plot's body as the schema writes it; nothing at all for a plot with
    neither an overview nor events."""
    if overview == "" and not nodes:
        return ""
    opened = f"<ol{_written_attributes([(_OVERVIEW, overview)])}>"
    events = [_written_plot_event(node) for node in nodes]
    return "\n".join([opened, *events, _EVENTS_CLOSED])


def plot_body_read(body: str) -> tuple[str, list[PlotNode]]:
    """The overview and the events a plot's body holds. A body that is not a list
    of events — one written before plots had events, or one never given any — is
    all overview."""
    lines = [line.strip() for line in body.split("\n")]
    lines = [line for line in lines if line != ""]
    opened = _EVENTS_OPENED.match(lines[0]) if lines else None
    if opened is None:
        return body, []
    overview = attributes_in(opened.group(1)).get(_OVERVIEW, "")
    nodes: list[PlotNode] = []
    for line in lines[1:]:
        if line == _EVENTS_CLOSED:
            break
        event = _EVENT.match(line)
        if event is None:
            continue
        node = _plot_event_read(event.group(1), event.group(2))
        nodes.append(node)
    return overview, nodes


def _plot_event_read(written_attributes: str, summary: str) -> PlotNode:
    attributes = attributes_in(written_attributes)
    node_id = attributes.get(_EVENT_ID) or str(uuid4())
    words = _EVENT_WORDS.match(attributes.get(_WORDS, ""))
    story_word_range = (
        None if words is None else StoryWordRange(int(words.group(1)), int(words.group(2)))
    )
    return PlotNode(
        node_id,
        story_word_range,
        attributes.get(_TIMESTAMP, ""),
        attributes.get(_LOCATION, ""),
        summary.strip(),
    )


def _written_plot_event(node: PlotNode) -> str:
    words = (
        ""
        if node.story_word_range is None
        else f"{node.story_word_range.first_word}-{node.story_word_range.last_word}"
    )
    attributes = _written_attributes(
        [
            (_EVENT_ID, node.node_id),
            (_TIMESTAMP, node.timestamp),
            (_LOCATION, node.location),
            (_WORDS, words),
        ]
    )
    # An event is one line, so a summary is too.
    summary = re.sub(r"\s*\n\s*", " ", node.summary)
    return f"<li{attributes}>{summary}</li>"


def _written_attributes(attributes: list[tuple[str, str]]) -> str:
    return "".join(
        f' {name}="{written_attribute_value(value)}"'
        for name, value in attributes
        if value != ""
    )
