import queue
import threading
import unittest
from unittest.mock import MagicMock, patch

import torch

from server.inference import encoder, resource_manager
from server.inference.encoder import EncoderModel
from server.inference.resource_manager import InferenceModelResourceManager


class ThreadQueue(queue.Queue):
    """The queue of a serving process that is really a thread.

    A request reaches the real serving process by pickling; here it is handed
    over as it is, so a test can send one that closes over its own events.
    """

    def close(self) -> None:
        pass


class LastToken(unittest.TestCase):
    """Pooling reads the end of a passage, wherever the padding leaves it."""

    def test_left_padding_takes_the_final_column(self) -> None:
        hidden = torch.tensor([[[1.0], [2.0]], [[3.0], [4.0]]])
        attention_mask = torch.tensor([[0, 1], [1, 1]])

        pooled = encoder._last_token(hidden, attention_mask)

        self.assertEqual(pooled.tolist(), [[2.0], [4.0]])

    def test_right_padding_takes_each_row_at_its_own_length(self) -> None:
        hidden = torch.tensor([[[1.0], [2.0]], [[3.0], [4.0]]])
        attention_mask = torch.tensor([[1, 0], [1, 1]])

        pooled = encoder._last_token(hidden, attention_mask)

        self.assertEqual(pooled.tolist(), [[1.0], [4.0]])


class Encoding(unittest.TestCase):

    def setUp(self):
        self.spawned: list[MagicMock] = []

        def spawn(target=None, kwargs=None, daemon=None):
            thread = threading.Thread(target=target, kwargs=kwargs, daemon=True)
            process = MagicMock()
            process.start.side_effect = thread.start
            process.is_alive.side_effect = thread.is_alive
            process.join.side_effect = thread.join
            self.spawned.append(process)
            return process

        self.addCleanup(patch.stopall)
        patch.object(resource_manager, "Process", side_effect=spawn).start()
        patch.object(resource_manager, "Queue", ThreadQueue).start()
        patch.object(encoder, "AutoTokenizer").start()
        patch.object(encoder, "AutoModel").start()

        self.resource_manager = InferenceModelResourceManager(quota_gb=8.0)
        self.addCleanup(self.resource_manager.shutdown)

    def test_passages_are_encoded_as_they_stand(self):
        encoded = []

        def encode(texts, model, tokenizer):
            encoded.append(texts)
            return [[0.1, 0.2], [0.3, 0.4]]

        patch.object(encoder, "_encode", side_effect=encode).start()
        model = EncoderModel("test-org/test-encoder", self.resource_manager, 5.0)

        vectors = model.encode(["knocking at the door", "michael goes down"])

        self.assertEqual(encoded, [("knocking at the door", "michael goes down")])
        self.assertEqual(vectors, [[0.1, 0.2], [0.3, 0.4]])

    def test_a_query_carries_the_instruction_a_passage_does_not(self):
        encoded = []

        def encode(texts, model, tokenizer):
            encoded.append(texts)
            return [[0.5, 0.6]]

        patch.object(encoder, "_encode", side_effect=encode).start()
        model = EncoderModel("test-org/test-encoder", self.resource_manager, 5.0)

        vector = model.encode_query("who knocks at the door?")

        self.assertEqual(
            encoded,
            [(f"Instruct: {encoder.SEARCH_TASK}\nQuery:who knocks at the door?",)],
        )
        self.assertEqual(vector, [0.5, 0.6])

    def test_a_failure_in_the_serving_process_is_raised_to_the_caller(self):
        patch.object(encoder, "_encode", side_effect=RuntimeError("out of memory")).start()
        model = EncoderModel("test-org/test-encoder", self.resource_manager, 5.0)

        with self.assertRaises(resource_manager.ModelNotAvailable):
            model.encode(["a passage"])


if __name__ == "__main__":
    unittest.main()
