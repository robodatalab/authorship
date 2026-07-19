"""Implementations of `StoryPerspective`.

Each one owns its prompt and its parsing. The plumbing they share — numbering the
manuscript, prising JSON out of a reply — lives at the top.
"""

import json
from typing import Any, Protocol

from . import log
from .story_graph import Edge, Node, StoryGraph, StoryPerspective

_log = log.logger(__name__)


class Infer(Protocol):
    """Send a prompt to the model, get the completion back.

    Injected rather than reached for, so a perspective can be exercised against a
    stub. `Worker.infer` satisfies it; nothing here imports transformers.
    """

    def __call__(self, prompt: str, max_new_tokens: int) -> str: ...


def numbered(story_markdown: str) -> str:
    """Prefix every line with its 0-based index.

    Counting lines is the arithmetic the model is worst at, and a span off by
    three is worse than no span — it highlights the wrong prose confidently.
    Prefixed, the task is copying a number it can see.

    Blank lines are numbered too: a blank line is a beat, and the indices have to
    keep counting through it either way.
    """
    return "\n".join(
        f"{index} | {line}" for index, line in enumerate(story_markdown.splitlines())
    )


def chat(system: str, user: str) -> str:
    """Render a turn the way Qwen's chat template does, with reasoning off.

    The worker tokenizes whatever string it is handed, so the markers belong to
    the prompt rather than to the server — a perspective that wanted a different
    model would render a different prompt, and nothing else would move.

    The empty `<think></think>` is how this checkpoint is told not to reason. It
    is a reasoning model: left to itself it opens the block and works through
    the manuscript first, which on this task costs thousands of tokens to reach
    the same JSON. Handing it a block already closed is the documented way out —
    omitting the marker is not, since the model then writes its own.
    """
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
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


SCENE_SYSTEM = """\
You break stories down into the scenes they are made of.

A scene is an event within the story that:
- has a clear beginning and ending, given as the first and last line it covers
- is focused around a specific topic or interaction
- would, if deleted, break the flow — the story either side of it would read as \
two separate stories

A scene is not a standalone piece of dialogue, unless that dialogue frames the \
whole situation and closes it. A scene is not a description of something.

Give each scene a title of at most four words saying what it is about.

Then say which scenes lead into which. Scenes generally string together in a \
single trajectory.

Every line of the manuscript is prefixed with its number and a pipe. The line \
numbers in your answer are those numbers, unchanged: `start` is the first line \
the scene covers and `end` is the last, both included. Scenes may share a \
boundary line. Do not renumber anything, and do not count lines yourself — copy \
the numbers you were shown.

Answer with one JSON object and nothing else, in exactly this shape:

{"nodes": [{"id": 1, "title": "knocking at the door", "start": 2, "end": 4},
           {"id": 2, "title": "michael goes down", "start": 4, "end": 9}],
 "edges": [{"from": 1, "to": 2}]}\
"""


class ScenePerspective(StoryPerspective):
    """Breaks a story into the string of scenes it is made of.

    One call returns nodes and edges together. Finding the scenes and relating
    them is the better decomposition on paper — the second call would see a short
    list of titles rather than the whole manuscript — but until we have watched
    this fail there is nothing to say which half is the weak one. Splitting is
    the first thing to try when it disappoints.

    Granularity is the open question, and the definition in `SCENE_SYSTEM` is a
    starting position, not a settled one.
    """

    #: Enough for the JSON and no more. With reasoning off the reply is a scene
    #: list, which runs to hundreds of tokens — and at the rate this machine
    #: generates, every token in the budget is a second the writer waits.
    def __init__(self, infer: Infer, max_new_tokens: int = 1024) -> None:
        self._infer = infer
        self._max_new_tokens = max_new_tokens

    def process(self, story_markdown: str) -> StoryGraph:
        prompt = chat(SCENE_SYSTEM, numbered(story_markdown))
        return build(json_object(self._infer(prompt, self._max_new_tokens)))


def build(payload: dict[str, Any]) -> StoryGraph:
    """Turn the model's JSON into a graph, discarding what it got wrong.

    The viewer drops malformed nodes and dangling edges too, so this is not what
    makes the file safe to read. It is what keeps the file honest: the
    alternative is writing the model's mistakes to disk and letting the renderer
    quietly hide them.

    Line numbers arrive 0-based, the way the manuscript was shown to the model,
    and become 1-based here — one conversion, in one place, rather than an
    off-by-one the model has to hold.
    """
    nodes: list[Node] = []
    for entry in payload.get("nodes") or []:
        node = as_node(entry)
        if node is None:
            _log.warning("dropped an unusable scene: %s", entry)
        else:
            nodes.append(node)

    known = {node.id for node in nodes}
    edges: list[Edge] = []
    for entry in payload.get("edges") or []:
        edge = as_edge(entry)
        # An edge naming a scene that did not survive has nothing to connect.
        if edge is None or edge.source not in known or edge.target not in known:
            _log.warning("dropped an unusable link: %s", entry)
        else:
            edges.append(edge)

    return StoryGraph(nodes=tuple(nodes), edges=tuple(edges))


def as_node(entry: Any) -> Node | None:
    if not isinstance(entry, dict):
        return None

    identifier = as_id(entry.get("id", entry.get("node")))
    start = as_line(entry.get("start"))
    end = as_line(entry.get("end"))
    title = str(entry.get("title") or "").strip()

    if identifier is None or start is None or end is None or not title:
        return None
    # A span running backwards tells us nothing about which lines were meant.
    if end < start:
        return None

    return Node(id=identifier, title=title, start=start + 1, end=end + 1)


def as_edge(entry: Any) -> Edge | None:
    if not isinstance(entry, dict):
        return None

    source = as_id(entry.get("from", entry.get("source")))
    target = as_id(entry.get("to", entry.get("target")))

    if source is None or target is None or source == target:
        return None

    return Edge(source=source, target=target)


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
