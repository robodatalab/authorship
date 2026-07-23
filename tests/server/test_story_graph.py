"""Tests for the on-disk shape `to_yaml` writes.

The thing worth pinning down is `group`: it rides along on a node or edge only
when it is set, so an ungrouped perspective's layer reads exactly as it did
before groups existed, and a perspective that finds nothing writes no layer.
"""

import unittest

import yaml

from server.story_graph import Edge, Node, StoryGraph, to_yaml


class ToYaml(unittest.TestCase):
    def test_an_ungrouped_layer_has_no_group_keys(self) -> None:
        graph = StoryGraph(nodes=(Node(id=1, title="a scene", start=1, end=4),))
        node = yaml.safe_load(to_yaml([graph]))["layer"][0]["nodes"][0]
        self.assertEqual(node, {"node": 1, "title": "a scene", "start": 1, "end": 4})
        self.assertNotIn("group", node)

    def test_a_grouped_layer_carries_the_group_on_nodes_and_edges(self) -> None:
        graph = StoryGraph(
            nodes=(
                Node(id=1, title="secret love", start=96, end=118, group=1),
                Node(id=2, title="secret love", start=308, end=322, group=1),
            ),
            edges=(Edge(source=1, target=2, group=1),),
        )
        layer = yaml.safe_load(to_yaml([graph]))["layer"][0]
        self.assertEqual(layer["nodes"][0]["group"], 1)
        self.assertEqual(layer["edges"][0]["group"], 1)

    def test_a_perspective_that_finds_nothing_writes_no_layer(self) -> None:
        scenes = StoryGraph(nodes=(Node(id=1, title="s", start=1, end=2),))
        plots = StoryGraph()  # the model found no plots
        document = yaml.safe_load(to_yaml([scenes, plots]))
        self.assertEqual(len(document["layer"]), 1)
        self.assertEqual(document["layer"][0]["id"], 1)


if __name__ == "__main__":
    unittest.main()
