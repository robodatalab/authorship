from server import log
from server.inference.inference import InferenceModel
from server.representations.utils import json_object, numbered, as_edge, as_node
from server.story_graph import Edge, Node, StoryGraph

_log = log.logger(__name__)


PLOT_SYSTEM = """\
You break stories down into the plots they weave together.

A plot is a single storyline running through the story — one trajectory of \
characters and events, followed from where it first surfaces to where it ends. \
A story usually carries several at once: a romance, a scheme, a secret, a \
rivalry, each advancing in its own stretches. Plots are not scenes. Scenes are \
the story told in order, front to back; plots run alongside each other, overlap, \
and interlock.

Find the distinct plots. Give each a name of at most four words and a number — \
its group — counting from one.

A plot surfaces in scattered stretches, not one unbroken run. Give each stretch \
as a node: the plot's name as its title, the plot's number as its group, and \
the first and last line it covers. Every node of one plot repeats that same name \
and that same group.

Then, for each plot, say which of its stretches leads into the next, in the \
order they are read — the trajectory of that plot. An edge carries the group of \
the plot it belongs to. Only ever link stretches of the same plot.

Unlike scenes, plots do not tile the story. Stretches from different plots may \
cover the same lines — that is where two plots intertwine — and some lines \
belong to no plot at all.

Every line of the manuscript is prefixed with its number and a pipe. The line \
numbers in your answer are those numbers, unchanged: `start` is the first line \
a stretch covers and `end` is the last, both included. Do not renumber \
anything, and do not count lines yourself — copy the numbers you were shown.

Answer with one JSON object and nothing else, in exactly this shape:

{"nodes": [{"id": 1, "title": "sophia's secret love", "start": 96, "end": 118, "group": 1},
           {"id": 2, "title": "sophia's secret love", "start": 308, "end": 322, "group": 1},
           {"id": 3, "title": "a new wardrobe", "start": 36, "end": 40, "group": 2},
           {"id": 4, "title": "a new wardrobe", "start": 74, "end": 124, "group": 2}],
 "edges": [{"from": 1, "to": 2, "group": 1},
           {"from": 3, "to": 4, "group": 2}]}\
"""


def build_plot_representation(
    model: InferenceModel, story_markdown: str
) -> StoryGraph:
    payload_str = model.complete(
        PLOT_SYSTEM, numbered(story_markdown), max_new_tokens=1536
    )
    payload = json_object(payload_str)

    nodes: list[Node] = []
    for entry in payload.get("nodes") or []:
        node = as_node(entry)
        if node is None:
            _log.warning("dropped an unusable plot stretch: %s", entry)
        else:
            nodes.append(node)

    known = {node.id for node in nodes}
    edges: list[Edge] = []
    for entry in payload.get("edges") or []:
        edge = as_edge(entry)
        # An edge naming a stretch that did not survive has nothing to connect.
        if edge is None or edge.source not in known or edge.target not in known:
            _log.warning("dropped an unusable link: %s", entry)
        else:
            edges.append(edge)

    return StoryGraph(nodes=tuple(nodes), edges=tuple(edges))
