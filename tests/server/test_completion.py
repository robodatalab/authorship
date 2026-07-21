"""Tests for the completion model's state machine.

No real subprocess and no real weights. `multiprocessing.Process` is replaced by
a fake that spawns nothing, and the tokenizer/model loads are stubbed, so the
test plays the download child itself — putting progress fractions and the final
DOWNLOADED marker on the queue the loading state hands out, and watching the
controller walk from loading to serving.
"""

import time
import unittest
from unittest import mock

from server.inference import completion
from server.inference.completion import (
    DOWNLOADED,
    CompletionModel,
    CompletionModelLoading,
    ModelNotAvailable,
)


def wait_until(predicate, timeout: float = 2.0, interval: float = 0.005) -> bool:
    """Give the monitor thread a moment to catch up, or give up after `timeout`.

    The monitor consumes the queue on its own thread, so an assertion about what
    it did has to wait for it rather than read the moment after a `put`.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


class FakeProcess:
    """Stands in for `multiprocessing.Process`: records its target, spawns nothing.

    The real child runs `download_process_main`, which pulls gigabytes of
    weights over the network. Here the test is the child: it puts progress and
    the DOWNLOADED marker on the queue the loading state created.
    """

    def __init__(self, target=None, kwargs=None, daemon=None, **_) -> None:
        self.target = target
        self.kwargs = kwargs or {}
        self.daemon = daemon
        self.started = False

    def start(self) -> None:
        self.started = True

    def join(self, timeout=None) -> None:
        pass

    def is_alive(self) -> bool:
        return False


class FakeTensor:
    """Enough of a tensor for `complete`: a shape, and a slice that returns itself."""

    def __init__(self, length: int) -> None:
        self.shape = (1, length)

    def __getitem__(self, index):
        return self


class FakeEncoding:
    def __init__(self, prompt_tokens: int) -> None:
        # A plain dict so `**inputs` unpacks into `generate`, the way a real
        # BatchEncoding does.
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


class CompletionModelStateMachine(unittest.TestCase):
    PROMPT_TOKENS = 5
    TOTAL_TOKENS = 8
    REPLY = "a bright, clean sentence"

    def setUp(self) -> None:
        self.tokenizer = FakeTokenizer(self.PROMPT_TOKENS, self.REPLY)
        self.model = FakeModel(self.TOTAL_TOKENS)
        self._models: list[CompletionModel] = []

        patchers = (
            mock.patch.object(completion.multiprocessing, "Process", FakeProcess),
            mock.patch.object(completion, "AutoTokenizer"),
            mock.patch.object(completion, "AutoModelForCausalLM"),
        )
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

        # TODO: error - these types are not MagicMocks, and don't have return_value
        completion.AutoTokenizer.from_pretrained.return_value = self.tokenizer
        completion.AutoModelForCausalLM.from_pretrained.return_value = self.model

    def tearDown(self) -> None:
        # Release any monitor thread still parked on an empty queue so it exits
        # with the test instead of lingering; the stubbed load makes it cheap.
        for model in self._models:
            state = model.state
            if isinstance(state, CompletionModelLoading):
                state.downloaded.put(DOWNLOADED)
                state.monitor_thread.join(timeout=2.0)

    def make_model(self) -> CompletionModel:
        model = CompletionModel()
        self._models.append(model)
        return model

    def test_completion_is_unavailable_while_loading(self) -> None:
        model = self.make_model()
        with self.assertRaises(ModelNotAvailable):
            model.complete("system", "user", 16)

    def test_status_reports_download_progress(self) -> None:
        model = self.make_model()

        # Before the first byte lands the monitor is parked and progress is zero.
        self.assertEqual(model.status(), "0% downloaded")

        loading = model.state
        assert isinstance(loading, CompletionModelLoading)

        loading.downloaded.put(0.5)
        self.assertTrue(wait_until(lambda: model.status() == "50% downloaded"))

        loading.downloaded.put(0.99)
        self.assertTrue(wait_until(lambda: model.status() == "99% downloaded"))

    def test_completes_once_the_model_is_downloaded(self) -> None:
        model = self.make_model()
        loading = model.state
        assert isinstance(loading, CompletionModelLoading)

        loading.downloaded.put(DOWNLOADED)
        self.assertTrue(wait_until(lambda: model.status() == "serving"))

        self.assertEqual(model.complete("system", "user", 16), self.REPLY)


if __name__ == "__main__":
    unittest.main()
