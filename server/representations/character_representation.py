from server import log
from server.inference.causal import CausalModel
from server.manuscript import Manuscript
from server.representations.utils import json_object, numbered, as_edge, as_node
from server.story_graph import Edge, Node, StoryGraph

_log = log.logger(__name__)


CHARACTER_SYSTEM = """\
You break stories down into the ways their characters change.

A character does not arrive finished. Over the story a trait shifts — someone \
guarded learns to trust, someone certain starts to doubt, someone gentle turns \
hard. That movement, from one state of a trait to the next, is what this reading \
follows: not who a character is at the end, but the path they took to get there.

First name the characters who change — usually several, not one. A story turns \
on more than a single person, and each of them walks their own path through it. \
Give each character a number — its group — counting from one.

Then take the characters one at a time and follow each alone. Give every state \
that character passes through as a node. Its title names the character and then \
the state, like "Sophia: guarded", "Sophia: beginning to trust", "Marcus: \
self-assured" — the name first, the state in a few words. Its group is that \
character's number, so one character reads as one colour throughout. Its first \
and last line are the passage that shows the character in that state; the span \
is where the change is visible, and it is what ties the state to the scene that \
drove it.

Thread each character's states into the order they are read — one state leading \
into the next — the trajectory of how that character changes. An edge carries \
the group of the character it belongs to. Only ever link states of the same \
character, and never run two different characters into one line.

Characters change alongside one another. States from different characters may \
cover the same lines — that is where two characters develop together, in the \
same scene — and many lines show no change at all.

Every line of the manuscript is prefixed with its number and a pipe. The line \
numbers in your answer are those numbers, unchanged: `start` is the first line a \
state's passage covers and `end` is the last, both included. Do not renumber \
anything, and do not count lines yourself — copy the numbers you were shown.

Answer with one JSON object and nothing else, in exactly this shape:

{"nodes": [{"id": 1, "title": "Sophia: guarded", "start": 12, "end": 20, "group": 1},
           {"id": 2, "title": "Sophia: beginning to trust", "start": 140, "end": 152, "group": 1},
           {"id": 3, "title": "Sophia: openly warm", "start": 300, "end": 311, "group": 1},
           {"id": 4, "title": "Marcus: self-assured", "start": 8, "end": 24, "group": 2},
           {"id": 5, "title": "Marcus: shaken", "start": 205, "end": 218, "group": 2}],
 "edges": [{"from": 1, "to": 2, "group": 1},
           {"from": 2, "to": 3, "group": 1},
           {"from": 4, "to": 5, "group": 2}]}\
"""


def build_character_representation(
    model: CausalModel, manuscript: Manuscript
) -> StoryGraph:
    payload_str = model.complete(
        CHARACTER_SYSTEM, numbered(manuscript), max_new_tokens=3072
    )
    payload = json_object(payload_str)

    nodes: list[Node] = []
    for entry in payload.get("nodes") or []:
        node = as_node(entry)
        if node is None:
            _log.warning("dropped an unusable trait state: %s", entry)
        else:
            nodes.append(node)

    known = {node.id for node in nodes}
    edges: list[Edge] = []
    for entry in payload.get("edges") or []:
        edge = as_edge(entry)
        # An edge naming a state that did not survive has nothing to connect.
        if edge is None or edge.source not in known or edge.target not in known:
            _log.warning("dropped an unusable link: %s", entry)
        else:
            edges.append(edge)

    return StoryGraph(nodes=tuple(nodes), edges=tuple(edges))
