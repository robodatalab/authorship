"""Tests for the scene perspective: prompt in, graph out.

No model and no server — `ScenePerspective` takes its `Infer` by injection, so a
canned reply exercises the whole path from completion to graph.
"""

import unittest

from server.perspectives import (
    SCENE_SYSTEM,
    ScenePerspective,
    as_edge,
    as_id,
    as_line,
    as_node,
    build,
    chat,
    json_object,
    numbered,
)
from server.story_graph import Edge, Node


class Numbered(unittest.TestCase):
    def test_prefixes_every_line_from_zero(self) -> None:
        self.assertEqual(numbered("one\ntwo"), "0 | one\n1 | two")

    def test_numbers_blank_lines_too(self) -> None:
        # A blank line is a beat, and the count has to run through it either way.
        self.assertEqual(numbered("one\n\ntwo"), "0 | one\n1 | \n2 | two")

    def test_trailing_newline_is_not_a_line(self) -> None:
        self.assertEqual(numbered("one\n"), "0 | one")

    def test_empty_story(self) -> None:
        self.assertEqual(numbered(""), "")

    def test_lines_keep_their_own_pipes(self) -> None:
        self.assertEqual(numbered("a | b"), "0 | a | b")


class Chat(unittest.TestCase):
    def test_renders_the_qwen_turn(self) -> None:
        self.assertEqual(
            chat("SYS", "USR"),
            "<|im_start|>system\nSYS<|im_end|>\n"
            "<|im_start|>user\nUSR<|im_end|>\n"
            "<|im_start|>assistant\n<think>\n\n</think>\n\n",
        )

    def test_hands_the_model_a_closed_reasoning_block(self) -> None:
        # Reasoning is this checkpoint's default: omitting the marker makes it
        # write its own. A block already closed is what turns it off.
        self.assertTrue(chat("s", "u").endswith("<think>\n\n</think>\n\n"))


class JsonObject(unittest.TestCase):
    def test_plain_object(self) -> None:
        self.assertEqual(json_object('{"a": 1}'), {"a": 1})

    def test_fenced_object(self) -> None:
        self.assertEqual(json_object('```json\n{"a": 1}\n```'), {"a": 1})

    def test_object_wrapped_in_commentary(self) -> None:
        self.assertEqual(json_object('Sure!\n{"a": 1}\nHope that helps.'), {"a": 1})

    def test_nested_braces(self) -> None:
        self.assertEqual(json_object('{"a": {"b": 2}}'), {"a": {"b": 2}})

    def test_braces_inside_strings_do_not_close_the_object(self) -> None:
        self.assertEqual(json_object('{"a": "}"}'), {"a": "}"})

    def test_escaped_quote_inside_a_string(self) -> None:
        self.assertEqual(json_object('{"a": "say \\" }"}'), {"a": 'say " }'})

    def test_takes_the_first_of_several_objects(self) -> None:
        self.assertEqual(json_object('{"a": 1}\nor maybe {"a": 2}'), {"a": 1})

    def test_no_object_at_all(self) -> None:
        with self.assertRaises(ValueError):
            json_object("I could not do that.")

    def test_object_never_closes(self) -> None:
        with self.assertRaises(ValueError):
            json_object('{"a": 1')

    def test_a_bare_list_is_not_an_object(self) -> None:
        with self.assertRaises(ValueError):
            json_object("[1, 2]")


class AsId(unittest.TestCase):
    def test_int(self) -> None:
        self.assertEqual(as_id(3), 3)

    def test_digit_string(self) -> None:
        self.assertEqual(as_id("3"), 3)

    def test_padded_digit_string(self) -> None:
        self.assertEqual(as_id(" 3 "), 3)

    def test_bool_is_not_an_id(self) -> None:
        # bool subclasses int, so this needs saying explicitly.
        self.assertIsNone(as_id(True))

    def test_float(self) -> None:
        self.assertIsNone(as_id(3.0))

    def test_words(self) -> None:
        self.assertIsNone(as_id("three"))

    def test_missing(self) -> None:
        self.assertIsNone(as_id(None))


class AsLine(unittest.TestCase):
    def test_zero_is_a_line(self) -> None:
        self.assertEqual(as_line(0), 0)

    def test_negative_is_not(self) -> None:
        self.assertIsNone(as_line(-1))

    def test_not_a_number(self) -> None:
        self.assertIsNone(as_line("start"))


class AsNode(unittest.TestCase):
    def test_shifts_lines_to_one_based(self) -> None:
        node = as_node({"id": 1, "title": "knocking", "start": 2, "end": 4})
        self.assertEqual(node, Node(id=1, title="knocking", start=3, end=5))

    def test_accepts_node_as_the_id_key(self) -> None:
        node = as_node({"node": 1, "title": "t", "start": 0, "end": 0})
        self.assertIsNotNone(node)
        assert node is not None
        self.assertEqual(node.id, 1)

    def test_a_single_line_scene(self) -> None:
        node = as_node({"id": 1, "title": "t", "start": 0, "end": 0})
        self.assertEqual(node, Node(id=1, title="t", start=1, end=1))

    def test_title_is_stripped(self) -> None:
        node = as_node({"id": 1, "title": "  t  ", "start": 0, "end": 1})
        self.assertIsNotNone(node)
        assert node is not None
        self.assertEqual(node.title, "t")

    def test_missing_id(self) -> None:
        self.assertIsNone(as_node({"title": "t", "start": 0, "end": 1}))

    def test_missing_title(self) -> None:
        self.assertIsNone(as_node({"id": 1, "start": 0, "end": 1}))

    def test_blank_title(self) -> None:
        self.assertIsNone(as_node({"id": 1, "title": "   ", "start": 0, "end": 1}))

    def test_missing_lines(self) -> None:
        self.assertIsNone(as_node({"id": 1, "title": "t"}))

    def test_backwards_span(self) -> None:
        self.assertIsNone(as_node({"id": 1, "title": "t", "start": 9, "end": 2}))

    def test_not_a_mapping(self) -> None:
        self.assertIsNone(as_node("scene one"))


class AsEdge(unittest.TestCase):
    def test_from_and_to(self) -> None:
        self.assertEqual(as_edge({"from": 1, "to": 2}), Edge(source=1, target=2))

    def test_source_and_target(self) -> None:
        self.assertEqual(as_edge({"source": 1, "target": 2}), Edge(source=1, target=2))

    def test_string_ids(self) -> None:
        self.assertEqual(as_edge({"from": "1", "to": "2"}), Edge(source=1, target=2))

    def test_self_edge(self) -> None:
        self.assertIsNone(as_edge({"from": 1, "to": 1}))

    def test_missing_end(self) -> None:
        self.assertIsNone(as_edge({"from": 1}))

    def test_not_a_mapping(self) -> None:
        self.assertIsNone(as_edge("1 -> 2"))


class Build(unittest.TestCase):
    def test_nodes_and_edges(self) -> None:
        graph = build(
            {
                "nodes": [
                    {"id": 1, "title": "one", "start": 0, "end": 2},
                    {"id": 2, "title": "two", "start": 2, "end": 5},
                ],
                "edges": [{"from": 1, "to": 2}],
            }
        )
        self.assertEqual(
            graph.nodes,
            (
                Node(id=1, title="one", start=1, end=3),
                Node(id=2, title="two", start=3, end=6),
            ),
        )
        self.assertEqual(graph.edges, (Edge(source=1, target=2),))

    def test_scenes_may_share_a_boundary_line(self) -> None:
        graph = build(
            {
                "nodes": [
                    {"id": 1, "title": "one", "start": 0, "end": 2},
                    {"id": 2, "title": "two", "start": 2, "end": 4},
                ]
            }
        )
        self.assertEqual(graph.nodes[0].end, graph.nodes[1].start)

    def test_drops_an_edge_naming_a_scene_that_did_not_survive(self) -> None:
        graph = build(
            {
                "nodes": [{"id": 1, "title": "one", "start": 0, "end": 2}],
                "edges": [{"from": 1, "to": 9}],
            }
        )
        self.assertEqual(graph.edges, ())

    def test_drops_an_edge_whose_source_was_dropped(self) -> None:
        graph = build(
            {
                "nodes": [
                    {"id": 1, "title": "one", "start": 0, "end": 2},
                    {"id": 2, "start": 3, "end": 4},
                ],
                "edges": [{"from": 2, "to": 1}],
            }
        )
        self.assertEqual(len(graph.nodes), 1)
        self.assertEqual(graph.edges, ())

    def test_keeps_the_good_nodes_around_a_bad_one(self) -> None:
        graph = build(
            {
                "nodes": [
                    {"id": 1, "title": "one", "start": 0, "end": 2},
                    {"id": 2, "title": "bad", "start": 9, "end": 2},
                    {"id": 3, "title": "three", "start": 3, "end": 4},
                ]
            }
        )
        self.assertEqual([node.id for node in graph.nodes], [1, 3])

    def test_missing_sections(self) -> None:
        graph = build({})
        self.assertEqual(graph.nodes, ())
        self.assertEqual(graph.edges, ())

    def test_null_sections(self) -> None:
        graph = build({"nodes": None, "edges": None})
        self.assertEqual(graph.nodes, ())

    def test_node_order_is_the_models(self) -> None:
        graph = build(
            {
                "nodes": [
                    {"id": 2, "title": "two", "start": 4, "end": 6},
                    {"id": 1, "title": "one", "start": 0, "end": 2},
                ]
            }
        )
        self.assertEqual([node.id for node in graph.nodes], [2, 1])


class Process(unittest.TestCase):
    """The whole path, against a canned completion."""

    def setUp(self) -> None:
        self.prompts: list[str] = []
        self.budgets: list[int] = []

    def infer(self, reply: str):
        def stub(prompt: str, max_new_tokens: int) -> str:
            self.prompts.append(prompt)
            self.budgets.append(max_new_tokens)
            return reply

        return stub

    def test_reply_becomes_a_graph(self) -> None:
        reply = (
            '```json\n{"nodes": [{"id": 1, "title": "knocking", "start": 2, "end": 4}],'
            ' "edges": []}\n```'
        )
        graph = ScenePerspective(self.infer(reply)).process("a\nb\nc\nd\ne")
        self.assertEqual(graph.nodes, (Node(id=1, title="knocking", start=3, end=5),))

    def test_prompt_carries_the_instructions_and_the_numbered_story(self) -> None:
        ScenePerspective(self.infer('{"nodes": []}')).process("one\ntwo")
        prompt = self.prompts[0]
        self.assertIn(SCENE_SYSTEM, prompt)
        self.assertIn("0 | one\n1 | two", prompt)

    def test_prompt_turns_reasoning_off(self) -> None:
        ScenePerspective(self.infer('{"nodes": []}')).process("one")
        self.assertTrue(self.prompts[0].endswith("<think>\n\n</think>\n\n"))

    def test_token_budget_is_passed_through(self) -> None:
        perspective = ScenePerspective(self.infer('{"nodes": []}'), max_new_tokens=99)
        perspective.process("one")
        self.assertEqual(self.budgets, [99])

    def test_an_unusable_reply_raises(self) -> None:
        # The endpoint turns this into a failed request, leaving the graph file
        # on disk untouched.
        with self.assertRaises(ValueError):
            ScenePerspective(self.infer("I could not do that.")).process("one")


if __name__ == "__main__":
    unittest.main()
