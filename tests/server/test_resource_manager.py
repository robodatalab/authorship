import threading
import time
import unittest
from unittest import mock

from server.inference import completion
from server.inference.completion import (
    DOWNLOADED,
    CompletionModel,
    CompletionModelLoading,
    CompletionModelResourceManager,
    CompletionModelServing,
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
        self.unloads = 0
        self._log = log if log is not None else []
        self.state = mock.Mock(spec=CompletionModelServing)

    def unload(self) -> None:
        self.unloads += 1
        self._log.append(("unload", self.name))

    def __repr__(self) -> str:
        return f"RecordingModel({self.name!r})"


class ResourceManagerResidency(unittest.TestCase):
    def test_taking_residency_makes_the_model_resident(self) -> None:
        manager = CompletionModelResourceManager()
        model = RecordingModel("only")

        self.assertIsNone(manager.resident)
        with manager.residency(model):
            self.assertIs(manager.resident, model)
        self.assertIs(manager.resident, model)
        self.assertEqual(model.unloads, 0)

    def test_reusing_the_resident_does_not_evict_it(self) -> None:
        manager = CompletionModelResourceManager()
        model = RecordingModel("only")

        with manager.residency(model):
            pass
        with manager.residency(model):
            pass

        self.assertEqual(model.unloads, 0)
        self.assertIs(manager.resident, model)

    def test_switching_models_evicts_the_previous_one(self) -> None:
        manager = CompletionModelResourceManager()
        first, second = RecordingModel("first"), RecordingModel("second")

        with manager.residency(first):
            pass
        with manager.residency(second):
            pass

        self.assertEqual(first.unloads, 1)
        self.assertEqual(second.unloads, 0)
        self.assertIs(manager.resident, second)

    def test_the_previous_model_is_unloaded_before_the_new_takes_the_slot(self) -> None:
        manager = CompletionModelResourceManager()
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
        manager = CompletionModelResourceManager()
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
        process_patcher = mock.patch.object(completion.multiprocessing, "Process")
        tokenizer_patcher = mock.patch.object(completion, "AutoTokenizer")
        model_patcher = mock.patch.object(completion, "AutoModelForCausalLM")
        complete_patcher = mock.patch.object(
            CompletionModelServing, "complete", return_value=REPLY
        )

        self.process = process_patcher.start()
        tokenizer_patcher.start()
        model_patcher.start()
        complete_patcher.start()
        for patcher in (
            process_patcher,
            tokenizer_patcher,
            model_patcher,
            complete_patcher,
        ):
            self.addCleanup(patcher.stop)

    def test_complete_blocks_until_the_model_finishes_loading(self) -> None:
        manager = CompletionModelResourceManager()
        model = CompletionModel(MODEL_ID, mock.Mock(), manager)

        reply: dict[str, str] = {}

        def call() -> None:
            reply["value"] = model.complete("system", "user", 16)

        caller = threading.Thread(target=call)
        caller.start()

        self.assertTrue(
            wait_until(lambda: isinstance(model.state, CompletionModelLoading))
        )
        self.assertIs(manager.resident, model)
        self.assertFalse(wait_until(lambda: not caller.is_alive(), timeout=0.2))
        self.assertNotIn("value", reply)

        model.state.downloaded.put(DOWNLOADED)

        caller.join(timeout=2.0)
        self.assertEqual(reply["value"], REPLY)
        self.assertIsInstance(model.state, CompletionModelServing)

    def test_a_second_completion_reuses_the_loaded_model(self) -> None:
        manager = CompletionModelResourceManager()
        model = CompletionModel(MODEL_ID, mock.Mock(), manager)

        model.load()
        model.state.downloaded.put(DOWNLOADED)
        self.assertTrue(
            wait_until(lambda: isinstance(model.state, CompletionModelServing))
        )
        loads = self.process.call_count

        self.assertEqual(model.complete("system", "user", 8), REPLY)
        self.assertEqual(model.complete("system", "user", 8), REPLY)
        self.assertIsInstance(model.state, CompletionModelServing)
        self.assertEqual(self.process.call_count, loads)


if __name__ == "__main__":
    unittest.main()
