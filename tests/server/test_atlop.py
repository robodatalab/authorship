from typing import Any
import unittest

from parameterized import parameterized
from server.models.atlop import _fences, _relate
import torch
from transformers import AutoTokenizer


class AtlopTests(unittest.TestCase):

    tokenizer: Any

    @classmethod
    def setUpClass(cls) -> None:
        cls.tokenizer = AutoTokenizer.from_pretrained("roberta-large")
        return super().setUpClass()

    @parameterized.expand([
        ("One Two Three", [(4, 6)], [0, 3762, 3226, 1596, 3226, 2873, 2], [2]),
        ("One Two Three", [(4, 12)], [0, 3762, 3226, 1596, 2873, 3226, 2], [2]),
        ("One Two Three", [(0, 2), (7, 12)], [0, 3226, 3762, 3226, 1596, 3226, 2873, 3226, 2], [1, 5]),
    ])
    def test_fencing(self, text, mentions, expected_input_ids, expected_fence_start_token_indices):
        input_ids, fence_start_token_indices = _fences(text, [mentions], self.tokenizer)
        self.assertListEqual(input_ids, expected_input_ids)
        self.assertListEqual(fence_start_token_indices, [expected_fence_start_token_indices])


    @parameterized.expand([
        ([[(0, 2)], [(4, 6)]], [(0, 1), (1, 0)], [[0.0, 1.0], [0.0, -1.0]], [(0, 1)]),
        ([[(0, 2)], [(4, 6)]], [(0, 1), (1, 0)], [[0.0, -1.0], [0.0, -1.0]], []),
        ([[(0, 2)], [(4, 6)]], [(0, 1)], [[0.0, 1.0, 1.0]], [(0, 1), (0, 1)]),
        ([[], [(0, 2)], [(4, 6)]], [(0, 1), (1, 0)], [[0.0, 1.0], [0.0, 1.0]], [(1, 2), (2, 1)]),
    ])
    def test_relate(self, mentions, pairs, logits, expected_relationships):
        fake_atlop_model = lambda input_ids, fenced: (pairs, torch.tensor(logits))

        relationships = _relate(
            "One Two Three",
            mentions,
            fake_atlop_model,
            self.tokenizer,
        )
        self.assertListEqual(relationships, expected_relationships)


if __name__ == "__main__":
    unittest.main()