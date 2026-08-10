"""Tests for the character perspective: a model's reply in, a graph out.

Like the scene and plot builders, `build_character_representation` takes its
completion model by injection and only ever asks it to `complete`, so a canned
reply drives the whole path. A character is a `group`; a node is one state of a
trait; an edge threads that trait's states in reading order.
"""

import unittest
from typing import cast
from unittest.mock import create_autospec

from roost import CausalModel
from server.manuscript import Manuscript
from server.representations.character_representation import (
    build_character_representation,
)
from server.story_graph import Edge, Node

STORY = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten"


def build_completion_model_mock(reply: str) -> CausalModel:
    model = create_autospec(CausalModel, instance=True)
    model.complete.return_value = reply
    return cast(CausalModel, model)


class InvalidReplies(unittest.TestCase):
    """A reply the builder cannot make an object of fails the whole build."""

    def test_no_json_at_all(self) -> None:
        model = build_completion_model_mock(
            reply="No character in this story changes."
        )
        with self.assertRaises(ValueError):
            build_character_representation(model, Manuscript(STORY))

    def test_object_never_closes(self) -> None:
        model = build_completion_model_mock(
            reply='{"nodes": [{"id": 1, "title": "guarded", "start": 0, "end": 1, "group": 1}'
        )
        with self.assertRaises(ValueError):
            build_character_representation(model, Manuscript(STORY))

    def test_reply_is_an_array_not_an_object(self) -> None:
        model = build_completion_model_mock(reply="[1, 2, 3]")
        with self.assertRaises(ValueError):
            build_character_representation(model, Manuscript(STORY))


class GroupedGraphs(unittest.TestCase):
    """Well-formed replies, with the character carried onto every node/edge."""

    def test_two_characters_become_grouped_trajectories(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "guarded", "start": 0, "end": 2, "group": 1},'
                '  {"id": 2, "title": "beginning to trust", "start": 4, "end": 5, "group": 1},'
                '  {"id": 3, "title": "self-assured", "start": 1, "end": 3, "group": 2},'
                '  {"id": 4, "title": "shaken", "start": 6, "end": 7, "group": 2}'
                '], "edges": ['
                '  {"from": 1, "to": 2, "group": 1},'
                '  {"from": 3, "to": 4, "group": 2}'
                "]}"
            )
        )
        graph = build_character_representation(model, Manuscript(STORY))
        # Lines arrive 0-based from the model and are stored 1-based, as read.
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="guarded", start=1, end=3, group=1),
                Node(id=2, title="beginning to trust", start=5, end=6, group=1),
                Node(id=3, title="self-assured", start=2, end=4, group=2),
                Node(id=4, title="shaken", start=7, end=8, group=2),
            ),
        )
        self.assertEqual(
            graph.edges,
            (
                Edge(source=1, target=2, group=1),
                Edge(source=3, target=4, group=2),
            ),
        )

    def test_overlapping_states_from_different_characters_both_survive(self) -> None:
        # Two characters shown changing over the same lines — co-development.
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "hardening", "start": 2, "end": 6, "group": 1},'
                '  {"id": 2, "title": "softening", "start": 4, "end": 5, "group": 2}'
                '], "edges": []}'
            )
        )
        graph = build_character_representation(model, Manuscript(STORY))
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="hardening", start=3, end=7, group=1),
                Node(id=2, title="softening", start=5, end=6, group=2),
            ),
        )

    def test_a_node_or_edge_without_a_group_is_ungrouped(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "restless", "start": 0, "end": 1},'
                '  {"id": 2, "title": "settled", "start": 1, "end": 2, "group": "oops"}'
                '], "edges": [{"from": 1, "to": 2}]}'
            )
        )
        graph = build_character_representation(model, Manuscript(STORY))
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="restless", start=1, end=2, group=None),
                Node(id=2, title="settled", start=2, end=3, group=None),
            ),
        )
        self.assertEqual(graph.edges, (Edge(source=1, target=2, group=None),))

    def test_unusable_nodes_are_dropped_and_the_rest_survive(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "kept", "start": 0, "end": 2, "group": 1},'
                '  {"id": 2, "title": "", "start": 2, "end": 3, "group": 1},'
                '  {"id": 3, "title": "backwards", "start": 5, "end": 2, "group": 2},'
                '  "not even an object",'
                '  {"id": 4, "title": "also kept", "start": 3, "end": 4, "group": 2}'
                '], "edges": []}'
            )
        )
        graph = build_character_representation(model, Manuscript(STORY))
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="kept", start=1, end=3, group=1),
                Node(id=4, title="also kept", start=4, end=5, group=2),
            ),
        )

    def test_edges_across_dropped_or_missing_states_are_dropped(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "guarded", "start": 0, "end": 1, "group": 1},'
                '  {"id": 2, "title": "open", "start": 1, "end": 2, "group": 1}'
                '], "edges": ['
                '  {"from": 1, "to": 2, "group": 1},'
                '  {"from": 2, "to": 9, "group": 1},'
                '  {"from": 1, "to": 1, "group": 1}'
                "]}"
            )
        )
        graph = build_character_representation(model, Manuscript(STORY))
        # A link needs both ends, and a state does not lead into itself.
        self.assertEqual(graph.edges, (Edge(source=1, target=2, group=1),))


if __name__ == "__main__":
    unittest.main()
