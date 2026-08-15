from typing import Any
import unittest

from parameterized import parameterized
from server.models.atlop import _fences, _relate
from transformers import AutoTokenizer


class AtlopTests(unittest.TestCase):

    tokenizer: Any

    @classmethod
    def setUpClass(cls) -> None:
        cls.tokenizer = AutoTokenizer.from_pretrained("roberta-large")
        return super().setUpClass()

    @parameterized.expand([
        ("One Two Three", [(4, 6)], [0, 3762, 3226, 1596, 3226, 2873, 2]),
        ("One Two Three", [(4, 12)], [0, 3762, 3226, 1596, 2873, 3226, 2]),
    ])
    def test_fencing(self, text, mentions, expected_input_ids):
        input_ids, indices = _fences(text, [mentions], self.tokenizer)
        self.assertListEqual(input_ids, expected_input_ids)


    def test_relate(self):
        pass


if __name__ == "__main__":
    unittest.main()