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
        self.spawned = []

        def spawn(target=None, kwargs=None, daemon=None):
            thread = threading.Thread(target=target, kwargs=kwargs, daemon=True)
            process = MagicMock()
            process.start.side_effect = thread.start
            process.is_alive.side_effect = thread.is_alive
            process.join.side_effect = thread.join
            self.spawned.append(process)
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

    def test_a_swap_waits_for_a_call_in_flight(self):
        # Otherwise the grace period hides the tear-down behind a long wait, and
        # the assertion below passes for the wrong reason.
        patcher = patch.object(inference, "STOP_GRACE_S", 0.05)
        patcher.start()
        self.addCleanup(patcher.stop)

        generating = threading.Event()
        finish = threading.Event()

        first = fake_kind("first response")
        first.model_id = "test-org/first"

        def slow_complete(*_args, **_kwargs):
            generating.set()
            finish.wait(timeout=5)
            return "first response"

        first.complete.side_effect = slow_complete

        second = fake_kind("second response")
        second.model_id = "test-org/second"

        responses = []

        def call_first():
            model = InferenceModel(first, self.resource_manager)
            responses.append(model.complete("system", "user", max_new_tokens=10))

        def call_second():
            model = InferenceModel(second, self.resource_manager)
            model.complete("system", "user", max_new_tokens=10)

        caller = threading.Thread(target=call_first, daemon=True)
        caller.start()
        self.assertTrue(generating.wait(timeout=5))

        swapper = threading.Thread(target=call_second, daemon=True)
        swapper.start()
        time.sleep(0.2)

        # The first model is still owed an answer, so its process must be intact.
        self.assertFalse(self.spawned[0].terminate.called)

        finish.set()
        caller.join(timeout=5)
        swapper.join(timeout=5)
        self.assertSequenceEqual(responses, ["first response"])


if __name__ == "__main__":
    unittest.main()
