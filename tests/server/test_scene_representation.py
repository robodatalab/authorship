"""Tests for the scene perspective: a model's reply in, a graph out.

No model and no server. `build_scene_representation` takes its completion model
by injection and only ever asks it to `complete`, so a canned reply drives the
whole path: the JSON is prised out of the text, the nodes and edges are
validated, and anything unusable is dropped before a `StoryGraph` comes back.
"""

import unittest
from typing import cast
from unittest.mock import create_autospec

from server.inference.kinds import CausalModel
from server.representations.scene_representation import build_scene_representation
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
            reply="I could not find any scenes in this story."
        )
        with self.assertRaises(ValueError):
            build_scene_representation(model, STORY)

    def test_object_never_closes(self) -> None:
        model = build_completion_model_mock(
            reply='{"nodes": [{"id": 1, "title": "x", "start": 0, "end": 1}'
        )
        with self.assertRaises(ValueError):
            build_scene_representation(model, STORY)

    def test_reply_is_an_array_not_an_object(self) -> None:
        model = build_completion_model_mock(reply="[1, 2, 3]")
        with self.assertRaises(ValueError):
            build_scene_representation(model, STORY)

    def test_malformed_json_inside_the_braces(self) -> None:
        model = build_completion_model_mock(reply='{"nodes": [1 2 3]}')
        with self.assertRaises(ValueError):
            build_scene_representation(model, STORY)


class GraphVariants(unittest.TestCase):
    """Well-formed replies, from the plain case through every tolerated shape."""

    def test_a_plain_graph_becomes_nodes_and_edges(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": [{"id": 1, "title": "knocking at the door", "start": 2, "end": 4},'
                '           {"id": 2, "title": "michael goes down", "start": 4, "end": 9}],'
                ' "edges": [{"from": 1, "to": 2}]}'
            )
        )
        graph = build_scene_representation(model, STORY)
        # Lines arrive 0-based from the model and are stored 1-based, as read.
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="knocking at the door", start=3, end=5),
                Node(id=2, title="michael goes down", start=5, end=10),
            ),
        )
        self.assertEqual(graph.edges, (Edge(source=1, target=2),))

    def test_json_wrapped_in_prose_and_fences_is_still_read(self) -> None:
        model = build_completion_model_mock(
            reply=(
                "Here are the scenes I found:\n"
                "```json\n"
                '{"nodes": [{"id": 1, "title": "the whole story", "start": 0, "end": 9}],'
                ' "edges": []}\n'
                "```\n"
                "Let me know if you would like more detail."
            )
        )
        graph = build_scene_representation(model, STORY)
        self.assertEqual(
            graph.nodes, (Node(id=1, title="the whole story", start=1, end=10),)
        )
        self.assertEqual(graph.edges, ())

    def test_an_empty_graph_is_allowed(self) -> None:
        model = build_completion_model_mock(reply='{"nodes": [], "edges": []}')
        graph = build_scene_representation(model, STORY)
        self.assertEqual(graph.nodes, ())
        self.assertEqual(graph.edges, ())

    def test_missing_keys_are_treated_as_empty(self) -> None:
        model = build_completion_model_mock(reply="{}")
        graph = build_scene_representation(model, STORY)
        self.assertEqual(graph.nodes, ())
        self.assertEqual(graph.edges, ())

    def test_string_ids_and_lines_are_accepted(self) -> None:
        # The model returns "1" for an id often enough to be worth taking.
        model = build_completion_model_mock(
            reply=(
                '{"nodes": [{"id": "1", "title": "a", "start": "0", "end": "2"},'
                '           {"id": "2", "title": "b", "start": "2", "end": "3"}],'
                ' "edges": [{"from": "1", "to": "2"}]}'
            )
        )
        graph = build_scene_representation(model, STORY)
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="a", start=1, end=3),
                Node(id=2, title="b", start=3, end=4),
            ),
        )
        self.assertEqual(graph.edges, (Edge(source=1, target=2),))

    def test_alternate_key_names_are_accepted(self) -> None:
        # `node`/`source`/`target` are the same fields as `id`/`from`/`to`.
        model = build_completion_model_mock(
            reply=(
                '{"nodes": [{"node": 1, "title": "a", "start": 0, "end": 1},'
                '           {"node": 2, "title": "b", "start": 1, "end": 2}],'
                ' "edges": [{"source": 1, "target": 2}]}'
            )
        )
        graph = build_scene_representation(model, STORY)
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="a", start=1, end=2),
                Node(id=2, title="b", start=2, end=3),
            ),
        )
        self.assertEqual(graph.edges, (Edge(source=1, target=2),))

    def test_unusable_nodes_are_dropped_and_the_rest_survive(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "kept", "start": 0, "end": 2},'
                '  {"id": 2, "title": "", "start": 2, "end": 3},'
                '  {"id": 3, "title": "backwards", "start": 5, "end": 2},'
                '  "not even an object",'
                '  {"id": 4, "title": "also kept", "start": 3, "end": 4}'
                '], "edges": []}'
            )
        )
        graph = build_scene_representation(model, STORY)
        # No title, a span running backwards, and a non-object all fall away.
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="kept", start=1, end=3),
                Node(id=4, title="also kept", start=4, end=5),
            ),
        )

    def test_edges_to_dropped_or_missing_nodes_are_dropped(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "a", "start": 0, "end": 1},'
                '  {"id": 2, "title": "b", "start": 1, "end": 2}'
                '], "edges": ['
                '  {"from": 1, "to": 2},'
                '  {"from": 2, "to": 9},'
                '  {"from": 1, "to": 1}'
                "]}"
            )
        )
        graph = build_scene_representation(model, STORY)
        # A link needs both ends: 9 was never a node, and a scene does not lead
        # into itself.
        self.assertEqual(graph.edges, (Edge(source=1, target=2),))


if __name__ == "__main__":
    unittest.main()
