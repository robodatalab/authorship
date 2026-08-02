from dataclasses import dataclass

from server import log
from server.inference.causal import CausalModel
from server.manuscript import Manuscript
from server.representations.utils import (
    json_object, numbered, as_edge, as_node
)
from server.story_graph import Edge, Node, StoryGraph

_log = log.logger(__name__)


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


def build_scene_representation(
    model: CausalModel, manuscript: Manuscript
) -> StoryGraph:
    payload_str = model.complete(
        SCENE_SYSTEM, numbered(manuscript), max_new_tokens=1024
    )
    payload = json_object(payload_str)

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

