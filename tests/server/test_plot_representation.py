import unittest
from typing import cast
from unittest.mock import create_autospec

from server.inference.completion import CompletionModel
from server.representations.plot_representation import build_plot_representation
from server.story_graph import Edge, Node

STORY = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten"


def build_completion_model_mock(reply: str) -> CompletionModel:
    model = create_autospec(CompletionModel, instance=True)
    model.complete.return_value = reply
    return cast(CompletionModel, model)


class InvalidReplies(unittest.TestCase):
    """A reply the builder cannot make an object of fails the whole build."""

    def test_no_json_at_all(self) -> None:
        model = build_completion_model_mock(
            reply="I could not find any plots in this story."
        )
        with self.assertRaises(ValueError):
            build_plot_representation(model, STORY)

    def test_object_never_closes(self) -> None:
        model = build_completion_model_mock(
            reply='{"nodes": [{"id": 1, "title": "x", "start": 0, "end": 1, "group": 1}'
        )
        with self.assertRaises(ValueError):
            build_plot_representation(model, STORY)

    def test_reply_is_an_array_not_an_object(self) -> None:
        model = build_completion_model_mock(reply="[1, 2, 3]")
        with self.assertRaises(ValueError):
            build_plot_representation(model, STORY)


class GroupedGraphs(unittest.TestCase):
    """Well-formed replies, with the group carried through onto every node/edge."""

    def test_two_plots_become_grouped_chains(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "secret love", "start": 0, "end": 2, "group": 1},'
                '  {"id": 2, "title": "secret love", "start": 6, "end": 7, "group": 1},'
                '  {"id": 3, "title": "new wardrobe", "start": 1, "end": 3, "group": 2},'
                '  {"id": 4, "title": "new wardrobe", "start": 4, "end": 5, "group": 2}'
                '], "edges": ['
                '  {"from": 1, "to": 2, "group": 1},'
                '  {"from": 3, "to": 4, "group": 2}'
                "]}"
            )
        )
        graph = build_plot_representation(model, STORY)
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="secret love", start=1, end=3, group=1),
                Node(id=2, title="secret love", start=7, end=8, group=1),
                Node(id=3, title="new wardrobe", start=2, end=4, group=2),
                Node(id=4, title="new wardrobe", start=5, end=6, group=2),
            ),
        )
        self.assertEqual(
            graph.edges,
            (
                Edge(source=1, target=2, group=1),
                Edge(source=3, target=4, group=2),
            ),
        )

    def test_a_node_or_edge_without_a_group_is_ungrouped(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "a", "start": 0, "end": 1},'
                '  {"id": 2, "title": "b", "start": 1, "end": 2, "group": "oops"}'
                '], "edges": [{"from": 1, "to": 2}]}'
            )
        )
        graph = build_plot_representation(model, STORY)
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="a", start=1, end=2, group=None),
                Node(id=2, title="b", start=2, end=3, group=None),
            ),
        )
        self.assertEqual(graph.edges, (Edge(source=1, target=2, group=None),))

    def test_string_ids_lines_and_groups_are_accepted(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": [{"id": "1", "title": "a", "start": "0", "end": "2", "group": "3"}],'
                ' "edges": []}'
            )
        )
        graph = build_plot_representation(model, STORY)
        self.assertEqual(graph.nodes, (Node(id=1, title="a", start=1, end=3, group=3),))

    def test_alternate_key_names_are_accepted(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"node": 1, "title": "a", "start": 0, "end": 1, "group": 1},'
                '  {"node": 2, "title": "a", "start": 1, "end": 2, "group": 1}'
                '], "edges": [{"source": 1, "target": 2, "group": 1}]}'
            )
        )
        graph = build_plot_representation(model, STORY)
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="a", start=1, end=2, group=1),
                Node(id=2, title="a", start=2, end=3, group=1),
            ),
        )
        self.assertEqual(graph.edges, (Edge(source=1, target=2, group=1),))

    def test_overlapping_stretches_from_different_plots_both_survive(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "wardrobe", "start": 2, "end": 6, "group": 1},'
                '  {"id": 2, "title": "secret love", "start": 4, "end": 5, "group": 2}'
                '], "edges": []}'
            )
        )
        graph = build_plot_representation(model, STORY)
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="wardrobe", start=3, end=7, group=1),
                Node(id=2, title="secret love", start=5, end=6, group=2),
            ),
        )

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
        graph = build_plot_representation(model, STORY)
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="kept", start=1, end=3, group=1),
                Node(id=4, title="also kept", start=4, end=5, group=2),
            ),
        )

    def test_edges_to_dropped_or_missing_nodes_are_dropped(self) -> None:
        model = build_completion_model_mock(
            reply=(
                '{"nodes": ['
                '  {"id": 1, "title": "a", "start": 0, "end": 1, "group": 1},'
                '  {"id": 2, "title": "a", "start": 1, "end": 2, "group": 1}'
                '], "edges": ['
                '  {"from": 1, "to": 2, "group": 1},'
                '  {"from": 2, "to": 9, "group": 1},'
                '  {"from": 1, "to": 1, "group": 1}'
                "]}"
            )
        )
        graph = build_plot_representation(model, STORY)
        self.assertEqual(graph.edges, (Edge(source=1, target=2, group=1),))


if __name__ == "__main__":
    unittest.main()
