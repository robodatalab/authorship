import threading
import time
import unittest
from unittest import mock

from server.inference import inference
from server.inference.inference import (
    DOWNLOADED,
    InferenceModel,
    InferenceModelLoading,
    InferenceModelResourceManager,
    InferenceModelServing,
)

MODEL_ID = "test-org/test-model"
REPLY = "a bright, clean sentence"


def wait_until(predicate, timeout: float = 2.0, interval: float = 0.005) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


class RecordingModel:
    def __init__(self, name: str, log: list | None = None) -> None:
        self.name = name
        self.model_id = name
        self.unloads = 0
        self._log = log if log is not None else []
        self.state = mock.Mock(spec=InferenceModelServing)

    def unload(self) -> None:
        self.unloads += 1
        self._log.append(("unload", self.name))

    def __repr__(self) -> str:
        return f"RecordingModel({self.name!r})"


class ResourceManagerResidency(unittest.TestCase):
    def test_taking_residency_makes_the_model_resident(self) -> None:
        manager = InferenceModelResourceManager()
        model = RecordingModel("only")

        self.assertIsNone(manager.resident)
        with manager.residency(model):
            self.assertIs(manager.resident, model)
        self.assertIs(manager.resident, model)
        self.assertEqual(model.unloads, 0)

    def test_reusing_the_resident_does_not_evict_it(self) -> None:
        manager = InferenceModelResourceManager()
        model = RecordingModel("only")

        with manager.residency(model):
            pass
        with manager.residency(model):
            pass

        self.assertEqual(model.unloads, 0)
        self.assertIs(manager.resident, model)

    def test_switching_models_evicts_the_previous_one(self) -> None:
        manager = InferenceModelResourceManager()
        first, second = RecordingModel("first"), RecordingModel("second")

        with manager.residency(first):
            pass
        with manager.residency(second):
            pass

        self.assertEqual(first.unloads, 1)
        self.assertEqual(second.unloads, 0)
        self.assertIs(manager.resident, second)

    def test_the_previous_model_is_unloaded_before_the_new_takes_the_slot(self) -> None:
        manager = InferenceModelResourceManager()
        log: list = []
        first, second = RecordingModel("first", log), RecordingModel("second", log)

        with manager.residency(first):
            log.append(("use", "first"))
        with manager.residency(second):
            log.append(("use", "second"))

        self.assertEqual(
            log,
            [("use", "first"), ("unload", "first"), ("use", "second")],
        )


class ResourceManagerMutualExclusion(unittest.TestCase):
    def test_a_second_caller_waits_until_the_first_releases_the_slot(self) -> None:
        manager = InferenceModelResourceManager()
        first, second = RecordingModel("first"), RecordingModel("second")

        holding = threading.Event()
        release = threading.Event()
        took_second = threading.Event()

        def hold_first() -> None:
            with manager.residency(first):
                holding.set()
                release.wait(timeout=5)

        def take_second() -> None:
            with manager.residency(second):
                took_second.set()

        first_thread = threading.Thread(target=hold_first)
        first_thread.start()
        self.assertTrue(holding.wait(timeout=5))
        self.assertIs(manager.resident, first)

        second_thread = threading.Thread(target=take_second)
        second_thread.start()

        self.assertFalse(took_second.wait(timeout=0.2))
        self.assertIs(manager.resident, first)
        self.assertEqual(first.unloads, 0)

        release.set()
        self.assertTrue(took_second.wait(timeout=5))
        first_thread.join(timeout=5)
        second_thread.join(timeout=5)
        self.assertIs(manager.resident, second)
        self.assertEqual(first.unloads, 1)


class WaitingForCompletion(unittest.TestCase):
    def setUp(self) -> None:
        process_patcher = mock.patch.object(inference.multiprocessing, "Process")
        tokenizer_patcher = mock.patch.object(inference, "AutoTokenizer")
        complete_patcher = mock.patch.object(
            InferenceModelServing, "complete", return_value=REPLY
        )
        # Freeing the weights reaches for the GPU, which the tests run without.
        cleanup_patcher = mock.patch.object(InferenceModelServing, "cleanup")

        self.process = process_patcher.start()
        tokenizer_patcher.start()
        complete_patcher.start()
        cleanup_patcher.start()
        for patcher in (
            process_patcher,
            tokenizer_patcher,
            complete_patcher,
            cleanup_patcher,
        ):
            self.addCleanup(patcher.stop)

    def test_complete_blocks_until_the_model_finishes_loading(self) -> None:
        manager = InferenceModelResourceManager()
        model = InferenceModel(MODEL_ID, mock.Mock(), manager)

        reply: dict[str, str] = {}

        def call() -> None:
            reply["value"] = model.complete("system", "user", 16)

        caller = threading.Thread(target=call)
        caller.start()

        self.assertTrue(
            wait_until(lambda: isinstance(model.state, InferenceModelLoading))
        )
        self.assertIs(manager.resident, model)
        self.assertFalse(wait_until(lambda: not caller.is_alive(), timeout=0.2))
        self.assertNotIn("value", reply)

        model.state.downloaded.put(DOWNLOADED)

        caller.join(timeout=2.0)
        self.assertEqual(reply["value"], REPLY)
        self.assertIsInstance(model.state, InferenceModelServing)

    def test_a_call_for_another_model_queues_and_takes_the_slot_when_it_frees(
        self,
    ) -> None:
        manager = InferenceModelResourceManager()
        first = InferenceModel("first-model", mock.Mock(), manager)
        second = InferenceModel("second-model", mock.Mock(), manager)

        replies: dict[str, str] = {}

        def call_first() -> None:
            replies["first"] = first.complete("system", "user", 8)

        def call_second() -> None:
            replies["second"] = second.complete("system", "user", 8)

        first_caller = threading.Thread(target=call_first)
        first_caller.start()
        self.assertTrue(
            wait_until(lambda: isinstance(first.state, InferenceModelLoading))
        )

        second_caller = threading.Thread(target=call_second)
        second_caller.start()
        self.assertTrue(wait_until(lambda: len(manager.waiting) == 1))

        # The first call holds the slot while its model loads, so the second has
        # not started loading anything of its own.
        holding = manager.holding
        assert holding is not None
        self.assertEqual(holding.model_id, "first-model")
        self.assertEqual(
            [request.model_id for request in manager.waiting], ["second-model"]
        )
        self.assertIs(manager.resident, first)
        self.assertEqual(second.status(), "unloaded")

        first.state.downloaded.put(DOWNLOADED)
        first_caller.join(timeout=2.0)
        self.assertEqual(replies["first"], REPLY)

        # With the slot free the queued call takes it, and loads its own model.
        self.assertTrue(
            wait_until(lambda: isinstance(second.state, InferenceModelLoading))
        )
        self.assertIs(manager.resident, second)
        self.assertEqual(manager.waiting, [])

        second.state.downloaded.put(DOWNLOADED)
        second_caller.join(timeout=2.0)
        self.assertEqual(replies["second"], REPLY)
        self.assertIsNone(manager.holding)

    def test_a_second_completion_reuses_the_loaded_model(self) -> None:
        manager = InferenceModelResourceManager()
        model = InferenceModel(MODEL_ID, mock.Mock(), manager)

        model.load()
        model.state.downloaded.put(DOWNLOADED)
        self.assertTrue(
            wait_until(lambda: isinstance(model.state, InferenceModelServing))
        )
        loads = self.process.call_count

        self.assertEqual(model.complete("system", "user", 8), REPLY)
        self.assertEqual(model.complete("system", "user", 8), REPLY)
        self.assertIsInstance(model.state, InferenceModelServing)
        self.assertEqual(self.process.call_count, loads)


if __name__ == "__main__":
    unittest.main()
