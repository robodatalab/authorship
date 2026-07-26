import threading
import time
import unittest
from unittest import mock

from server.inference import inference, kinds
from server.inference.inference import (
    DOWNLOADED,
    InferenceModel,
    InferenceModelLoading,
    InferenceModelServing,
    InferenceModelUnloaded,
)
from server.inference.kinds import CausalModel

MODEL_ID = "test-org/test-model"
PROMPT_TOKENS = 5
TOTAL_TOKENS = 8
REPLY = "a bright, clean sentence"


def format_prompt(system: str, user: str) -> str:
    return f"{system}\n{user}"


def wait_until(predicate, timeout: float = 2.0, interval: float = 0.005) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


class FakeProcess:
    """Stands in for a spawned child.

    The download is driven by the test, so that target is never run. The serving
    one is run on a thread, so a model can still be asked for a completion.
    """

    def __init__(self, target=None, kwargs=None, daemon=None, **_) -> None:
        self.target = target
        self.kwargs = kwargs or {}
        self.daemon = daemon
        self._thread = None

    def start(self) -> None:
        if self.target is inference.serving_process_main:
            self._thread = threading.Thread(
                target=self.target, kwargs=self.kwargs, daemon=True
            )
            self._thread.start()

    def terminate(self) -> None:
        # A thread cannot be killed the way the real process is; the serving
        # loop stops on a request of None. Already stopped is nothing to do —
        # the queues are closed once a model has been unloaded.
        if self._thread is not None and self._thread.is_alive():
            self.kwargs["requests"].put(None)

    def join(self, timeout=None) -> None:
        if self._thread is not None:
            self._thread.join(timeout=timeout if timeout is not None else 2.0)

    def is_alive(self) -> bool:
        return self._thread is not None and self._thread.is_alive()


class FakeTensor:
    def __init__(self, length: int) -> None:
        self.shape = (1, length)

    def __getitem__(self, index):
        return self


class FakeEncoding:
    def __init__(self, prompt_tokens: int) -> None:
        self._tensors = {"input_ids": FakeTensor(prompt_tokens)}

    def to(self, device):
        return self._tensors


class FakeTokenizer:
    def __init__(self, prompt_tokens: int, reply: str) -> None:
        self._prompt_tokens = prompt_tokens
        self._reply = reply

    def __call__(self, prompt, return_tensors=None):
        return FakeEncoding(self._prompt_tokens)

    def decode(self, token_ids, skip_special_tokens=True) -> str:
        return self._reply


class FakeModel:
    device = "cpu"

    def __init__(self, total_tokens: int) -> None:
        self._total_tokens = total_tokens

    def eval(self):
        return self

    def generate(self, input_ids=None, max_new_tokens=None, streamer=None, **_):
        return [FakeTensor(self._total_tokens)]


class InferenceModelStateMachine(unittest.TestCase):
    def setUp(self) -> None:
        # A serving process outlives the test unless the model is unloaded, and
        # its thread would still be parked on the queue at interpreter shutdown.
        running: list[FakeProcess] = []

        def spawn(**kwargs) -> FakeProcess:
            process = FakeProcess(**kwargs)
            running.append(process)
            return process

        def stop_the_children() -> None:
            for process in running:
                process.terminate()

        self.addCleanup(stop_the_children)

        process_patcher = mock.patch.object(
            inference.multiprocessing, "Process", spawn
        )
        tokenizer_patcher = mock.patch.object(inference, "AutoTokenizer")
        model_patcher = mock.patch.object(kinds, "AutoModelForCausalLM")
        empty_cache_patcher = mock.patch("torch.mps.empty_cache")

        process_patcher.start()
        auto_tokenizer = tokenizer_patcher.start()
        auto_model = model_patcher.start()
        empty_cache_patcher.start()
        for patcher in (
            process_patcher,
            tokenizer_patcher,
            model_patcher,
            empty_cache_patcher,
        ):
            self.addCleanup(patcher.stop)

        auto_tokenizer.from_pretrained.return_value = FakeTokenizer(PROMPT_TOKENS, REPLY)
        auto_model.from_pretrained.return_value = FakeModel(TOTAL_TOKENS)

    def test_a_new_model_starts_unloaded(self) -> None:
        model = InferenceModel(MODEL_ID, CausalModel(format_prompt), mock.Mock())
        self.assertIsInstance(model.state, InferenceModelUnloaded)
        self.assertEqual(model.status(), "unloaded")

    def test_loading_reports_download_progress(self) -> None:
        model = InferenceModel(MODEL_ID, CausalModel(format_prompt), mock.Mock())
        model.load()
        loading = model.state
        assert isinstance(loading, InferenceModelLoading)

        self.assertEqual(model.status(), f"{MODEL_ID}: 0% downloaded")

        loading.downloaded.put(0.5)
        self.assertTrue(
            wait_until(lambda: model.status() == f"{MODEL_ID}: 50% downloaded")
        )

        loading.downloaded.put(0.99)
        self.assertTrue(
            wait_until(lambda: model.status() == f"{MODEL_ID}: 99% downloaded")
        )

    def test_loading_reaches_serving_when_the_download_finishes(self) -> None:
        model = InferenceModel(MODEL_ID, CausalModel(format_prompt), mock.Mock())
        model.load()
        model.state.downloaded.put(DOWNLOADED)

        self.assertTrue(
            wait_until(lambda: isinstance(model.state, InferenceModelServing))
        )
        self.assertEqual(model.status(), "serving")

    def test_a_serving_model_generates_the_reply(self) -> None:
        model = InferenceModel(MODEL_ID, CausalModel(format_prompt), mock.Mock())
        model.load()
        model.state.downloaded.put(DOWNLOADED)
        self.assertTrue(
            wait_until(lambda: isinstance(model.state, InferenceModelServing))
        )

        serving = model.state
        assert isinstance(serving, InferenceModelServing)
        self.assertEqual(serving.complete("system", "user", 16), REPLY)

    def test_an_unloaded_model_can_be_loaded_again(self) -> None:
        model = InferenceModel(MODEL_ID, CausalModel(format_prompt), mock.Mock())
        model.load()
        model.state.downloaded.put(DOWNLOADED)
        self.assertTrue(
            wait_until(lambda: isinstance(model.state, InferenceModelServing))
        )

        model.unload()
        self.assertIsInstance(model.state, InferenceModelUnloaded)

        model.load()
        model.state.downloaded.put(DOWNLOADED)
        self.assertTrue(
            wait_until(lambda: isinstance(model.state, InferenceModelServing))
        )

        serving = model.state
        assert isinstance(serving, InferenceModelServing)
        self.assertEqual(serving.complete("system", "user", 16), REPLY)


if __name__ == "__main__":
    unittest.main()
