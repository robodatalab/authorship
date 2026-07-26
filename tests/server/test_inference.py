import threading
import time
import unittest
from unittest.mock import MagicMock, patch

from server.inference import inference
from server.inference.kinds import ModelKind
from server.inference.inference import (
    InferenceModel,
    InferenceModelResourceManager,
)


def fake_kind(response: str) -> MagicMock:
    kind = MagicMock(spec=ModelKind)
    kind.model_id = "test-org/test-model"
    kind.load.return_value = (MagicMock(), MagicMock())
    kind.complete.return_value = response
    return kind


class InferenceModelTests(unittest.TestCase):

    def setUp(self):
        def spawn(target=None, kwargs=None, daemon=None):
            thread = threading.Thread(target=target, kwargs=kwargs, daemon=True)
            process = MagicMock()
            process.start.side_effect = thread.start
            process.is_alive.side_effect = thread.is_alive
            process.join.side_effect = thread.join
            return process

        patcher = patch.object(inference, "Process", side_effect=spawn)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.resource_manager = InferenceModelResourceManager()
        self.addCleanup(self.resource_manager._stop_model_process)

    def test_complete_waits_until_model_is_loaded(self):
        loaded = threading.Event()
        kind = fake_kind("model response 1")

        def load():
            loaded.wait(timeout=5)
            return MagicMock(), MagicMock()

        kind.load.side_effect = load
        model = InferenceModel(kind, self.resource_manager)

        responses = []

        def call():
            responses.append(model.complete("system", "user", max_new_tokens=10))

        caller = threading.Thread(target=call, daemon=True)
        caller.start()

        time.sleep(0.05)
        self.assertEqual(responses, [])

        loaded.set()
        caller.join(timeout=5)
        self.assertSequenceEqual(responses, ["model response 1"])

    def test_model_runs_inference(self):
        model = InferenceModel(fake_kind("model response 2"), self.resource_manager)

        response = model.complete("system", "user", max_new_tokens=10)

        self.assertEqual(response, "model response 2")


if __name__ == "__main__":
    unittest.main()
