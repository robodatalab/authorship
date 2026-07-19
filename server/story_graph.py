"""The graph a perspective produces, and the abstraction that produces it.

Free of both FastAPI and transformers: a perspective is a pure function from
manuscript text to a graph, whatever it leans on to get there.
"""

import abc
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import yaml


@dataclass(frozen=True)
class Node:
    """One unit of the story, whatever the perspective takes a unit to be."""

    id: int
    title: str
    #: 1-based inclusive manuscript lines, as the viewer reads them.
    start: int
    end: int


@dataclass(frozen=True)
class Edge:
    """A relationship between two nodes, named by their ids.

    `source`/`target` rather than the file's `start`/`end`, which mean line
    numbers on a node and node ids on an edge. The ambiguity belongs to the
    format, so it is introduced in `to_yaml` and nowhere else.
    """

    source: int
    target: int


@dataclass(frozen=True)
class StoryGraph:
    nodes: tuple[Node, ...] = ()
    edges: tuple[Edge, ...] = ()


class StoryPerspective(abc.ABC):
    """A way of breaking a story down.

    Scenes, plots, character paths — each is a different reading of the same
    manuscript, and each becomes its own layer in the file. Implementations are
    free in how they decompose; only the result is agreed on here.
    """

    @abc.abstractmethod
    def process(self, story_markdown: str) -> StoryGraph:
        pass


def to_yaml(graphs: Sequence[StoryGraph]) -> str:
    """Condense one graph per perspective into the viewer's layered file.

    Layers are ordered as the perspectives were, and numbered from one. Nothing
    relates them but line overlap, so no cross-layer reference is written.
    """
    layers = [
        {
            "id": index,
            "nodes": [
                {
                    "node": node.id,
                    "title": node.title,
                    "start": node.start,
                    "end": node.end,
                }
                for node in graph.nodes
            ],
            # `start`/`end` are node ids here, not lines. See `Edge`.
            "edges": [
                {"edge": position, "start": edge.source, "end": edge.target}
                for position, edge in enumerate(graph.edges, start=1)
            ],
        }
        for index, graph in enumerate(graphs, start=1)
        if graph.nodes
    ]

    return dump({"layer": layers})


def dump(document: Any) -> str:
    return yaml.safe_dump(document, sort_keys=False, allow_unicode=True)
