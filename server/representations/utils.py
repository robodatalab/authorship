from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any, Sequence

from server.story_graph import Edge, Node

SECTION_SEPARATOR = "##"

_COMMENT_OPEN = "<!--"
_COMMENT_CLOSE = "-->"


@dataclass(frozen=True)
class Piece:
    """A stretch of a manuscript, and whether it is a comment rather than story."""

    text: str
    comment: bool


def split_comments(text: str, inside: bool = False) -> tuple[list[Piece], bool]:
    """`text` in runs of story and comment, and whether it ends inside one."""
    pieces: list[Piece] = []
    start = 0
    position = 0

    while position < len(text):
        if inside:
            close = text.find(_COMMENT_CLOSE, position)
            if close < 0:
                break
            position = close + len(_COMMENT_CLOSE)
            pieces.append(Piece(text[start:position], comment=True))
            start = position
            inside = False
        else:
            opened = text.find(_COMMENT_OPEN, position)
            if opened < 0:
                break
            if opened > start:
                pieces.append(Piece(text[start:opened], comment=False))
            start = opened
            position = opened + len(_COMMENT_OPEN)
            inside = True

    # Whatever the scan ran off the end of: prose if nothing had opened, and the
    # unclosed comment itself if something had.
    if start < len(text):
        pieces.append(Piece(text[start:], comment=inside))
    return pieces, inside


def visible_lines(lines: Sequence[str]) -> list[str]:
    """Each line with its comments taken out."""
    inside = False
    visible: list[str] = []
    for line in lines:
        pieces, inside = split_comments(line, inside)
        visible.append("".join(piece.text for piece in pieces if not piece.comment))
    return visible


@dataclass
class Section:
    """A heading and the lines beneath it, 0-based and inclusive.

    `start` is the line after the heading, so a section's own heading sits at
    `start - 1`. A section with `end < start` has a heading and nothing under it.
    """

    start: int
    end: int
    title: str


def parse_sections(story_markdown: str) -> list[Section]:
    """Split a manuscript at its `##` headings."""
    lines = visible_lines(story_markdown.splitlines())
    last = len(lines) - 1

    sections: list[Section] = []
    section = Section(start=0, end=last, title="First anonymous section")
    for index, line in enumerate(lines):
        if line.startswith(SECTION_SEPARATOR):
            section.end = index - 1
            sections.append(section)
            section = Section(start=index + 1, end=last, title=line[2:].strip())
    # The final section is closed by the end of the file rather than by a heading,
    # so nothing in the loop appends it.
    sections.append(section)
    return sections


def section_at(sections: list[Section], line: int) -> Section | None:
    """The section a line falls in, counting a heading as part of what it opens."""
    for section in sections:
        if section.start - 1 <= line <= section.end:
            return section
    return None


def graph_path_for(document: Path) -> Path:
    """`story.md` sits next to `story.graph.yaml` — by convention, not
    configuration. Mirrors `graphPathFor` in extension/story_graph/model.ts."""
    stem = re.sub(r"\.md$", "", document.name, flags=re.I)
    return document.with_name(stem + ".graph.yaml")


def numbered(story_markdown: str) -> str:
    """Prefix every line with its 0-based index."""
    return "\n".join(
        f"{index} | {line}" for index, line in enumerate(story_markdown.splitlines())
    )


def json_object(reply: str) -> dict[str, Any]:
    """Take the first JSON object out of a completion.

    The reply is prose as far as the server is concerned — it may arrive fenced,
    prefaced, or trailed by commentary. Scanning for a balanced object survives
    all three. Raises `ValueError` if there is nothing usable, which fails the
    request and leaves the existing graph file alone.
    """
    start = reply.find("{")
    if start < 0:
        raise ValueError("no JSON object in the model's reply")

    depth = 0
    in_string = False
    escaped = False

    for position in range(start, len(reply)):
        character = reply[position]

        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue

        if character == '"':
            in_string = True
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                parsed = json.loads(reply[start : position + 1])
                if not isinstance(parsed, dict):
                    raise ValueError("the model's reply was not a JSON object")
                return parsed

    raise ValueError("the model's reply ended mid-object")


def as_node(entry: Any) -> Node | None:
    if not isinstance(entry, dict):
        return None

    identifier = as_id(entry.get("id", entry.get("node")))
    start = as_line(entry.get("start"))
    end = as_line(entry.get("end"))
    title = str(entry.get("title") or "").strip()
    group = as_id(entry.get("group", None))

    if identifier is None or start is None or end is None or not title:
        return None
    # A span running backwards tells us nothing about which lines were meant.
    if end < start:
        return None

    return Node(id=identifier, title=title, start=start + 1, end=end + 1, group=group)


def as_edge(entry: Any) -> Edge | None:
    if not isinstance(entry, dict):
        return None

    source = as_id(entry.get("from", entry.get("source")))
    target = as_id(entry.get("to", entry.get("target")))
    group = as_id(entry.get("group", None))

    if source is None or target is None or source == target:
        return None

    return Edge(source=source, target=target, group=group)


def as_id(value: Any) -> int | None:
    """Ids are ints, but the model returns "3" often enough to be worth taking."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value)
    return None


def as_line(value: Any) -> int | None:
    """A 0-based line index, or None if it is not one."""
    index = as_id(value)
    return index if index is not None and index >= 0 else None
