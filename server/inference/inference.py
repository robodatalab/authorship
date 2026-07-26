import abc
import multiprocessing
import os
import threading
import time
from contextlib import contextmanager
from typing import Generator
from multiprocessing.queues import Queue

from huggingface_hub import snapshot_download
from server import log
from server.inference.kinds import ModelKind
from server.inference.monitoring import reporting_tqdm
import torch
from transformers import AutoTokenizer

_log = log.logger(__name__)
os.environ.setdefault("HF_DEACTIVATE_ASYNC_LOAD", "1")

DOWNLOADED = "downloaded"


class ModelNotAvailable(Exception):
    pass


def gpu_memory_used() -> float:
    """GB the Metal driver holds for this process.

    Allocator pools and MPSGraph included, so it does not fall when tensors are
    freed — `empty_cache` only hands back unoccupied allocator blocks.
    """
    if not torch.backends.mps.is_available():
        return 0.0
    return torch.mps.driver_allocated_memory() / 1e9


def gpu_tensors() -> float:
    """GB held by live tensors — what a model actually occupies."""
    if not torch.backends.mps.is_available():
        return 0.0
    return torch.mps.current_allocated_memory() / 1e9


def gpu_memory_limit() -> float:
    """GB the driver will hand this process before it starts refusing."""
    if not torch.backends.mps.is_available():
        return 0.0
    return torch.mps.recommended_max_memory() / 1e9


class InferenceModelState(abc.ABC):
    @abc.abstractmethod
    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        pass

    @abc.abstractmethod
    def status(self) -> str:
        pass

    @abc.abstractmethod
    def cleanup(self) -> None:
        pass


class ResidencyRequest:
    """One call's claim on the GPU: queued for it, or holding it and working."""

    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self._since = time.monotonic()

    @property
    def elapsed(self) -> float:
        """How long it has been in its current state — waiting, or holding."""
        return time.monotonic() - self._since

    def restamp(self) -> None:
        self._since = time.monotonic()


class InferenceModelResourceManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ready = threading.Condition()
        self._resident: "InferenceModel | None" = None
        # The queue is a record of who is asking, not the thing that decides
        # who goes next — `_lock` still does that.
        self._queue = threading.Lock()
        self._waiting: list[ResidencyRequest] = []
        self._holding: ResidencyRequest | None = None

    @property
    def resident(self) -> "InferenceModel | None":
        return self._resident

    @property
    def holding(self) -> ResidencyRequest | None:
        with self._queue:
            return self._holding

    @property
    def waiting(self) -> list[ResidencyRequest]:
        with self._queue:
            return list(self._waiting)

    def wake(self) -> None:
        with self._ready:
            self._ready.notify_all()

    @contextmanager
    def residency(self, model: "InferenceModel") -> Generator[None, None, None]:
        request = ResidencyRequest(model.model_id)
        with self._queue:
            self._waiting.append(request)
        with self._lock:
            with self._queue:
                self._waiting.remove(request)
                request.restamp()
                self._holding = request
            try:
                if self._resident is not model:
                    if self._resident is not None:
                        self._resident.unload()
                    self._resident = model
                if not isinstance(model.state, InferenceModelServing):
                    model.load()
                    with self._ready:
                        self._ready.wait_for(
                            lambda: isinstance(model.state, InferenceModelServing)
                        )
                yield
            finally:
                with self._queue:
                    self._holding = None


class InferenceModel:
    def __init__(
        self,
        model_id: str,
        kind: ModelKind,
        manager: InferenceModelResourceManager,
    ) -> None:
        self.model_id = model_id
        self.kind = kind
        self.manager = manager
        self.state: InferenceModelState = InferenceModelUnloaded(model_id)

    def set_state(self, state: InferenceModelState) -> None:
        if type(self.state) is type(state):
            return
        self.state.cleanup()
        self.state = state
        self.manager.wake()

    def load(self) -> None:
        self.set_state(InferenceModelLoading(self, self.model_id))

    def unload(self) -> None:
        self.set_state(InferenceModelUnloaded(self.model_id))

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        with self.manager.residency(self):
            return self.state.complete(system, user, max_new_tokens)

    def status(self) -> str:
        return self.state.status()


class InferenceModelUnloaded(InferenceModelState):
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        raise ModelNotAvailable(f"Model {self.model_id} has been unloaded")

    def status(self) -> str:
        return "unloaded"

    def cleanup(self) -> None:
        pass


class InferenceModelLoading(InferenceModelState):
    def __init__(self, controller: InferenceModel, model_id: str) -> None:
        self.controller = controller
        self.model_id = model_id
        self.progress = 0.0
        self.downloaded: Queue[float | str] = multiprocessing.Queue()
        self.download_process = multiprocessing.Process(
            target=download_process_main,
            kwargs=dict(signal=self.downloaded, model_id=model_id),
            daemon=True,
        )
        self.download_process.start()

        self.monitor_thread = threading.Thread(
            target=monitor_thread_main,
            kwargs=dict(loading=self, model_id=model_id),
            daemon=True,
        )
        self.monitor_thread.start()

    def cleanup(self) -> None:
        self.download_process.join()

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        raise ModelNotAvailable(f"Inference model '{self.model_id}' is loading")

    def status(self) -> str:
        return f"{self.model_id}: {self.progress:.0%} downloaded"


def download_process_main(signal: Queue[float | str], model_id: str) -> None:
    """Child process: pull every weight file into the cache, then report back."""
    log.setup()
    _log.info("downloading %s", model_id)
    started = time.monotonic()
    snapshot_download(model_id, tqdm_class=reporting_tqdm(signal))
    _log.info("downloaded %s in %.0fs", model_id, time.monotonic() - started)
    signal.put(DOWNLOADED)


def monitor_thread_main(loading: InferenceModelLoading, model_id: str) -> None:
    """Track the download's progress, then load the model in this process."""
    while True:
        message = loading.downloaded.get()
        if message == DOWNLOADED:
            break
        loading.progress = float(message)

    _log.info("download complete, handing %s to a serving process", model_id)
    controller = loading.controller
    controller.set_state(InferenceModelServing(controller, model_id, controller.kind))


def serving_process_main(
    requests: Queue,
    replies: Queue,
    model_id: str,
    kind: ModelKind,
) -> None:
    """Child process: hold the model and answer completions until it is killed."""
    log.setup()
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = kind.load(model_id)
    except Exception as err:
        replies.put((str(err), None))
        return

    _log.info(
        "serving %s: tensors %.1fGB, driver %.1fGB, limit %.1fGB",
        model_id,
        gpu_tensors(),
        gpu_memory_used(),
        gpu_memory_limit(),
    )
    replies.put((None, None))

    while True:
        system, user, max_new_tokens = requests.get()
        try:
            replies.put((None, kind.complete(model, tokenizer, system, user, max_new_tokens)))
        except Exception as err:
            replies.put((str(err), None))


class InferenceModelServing(InferenceModelState):

    def __init__(
        self,
        controller: InferenceModel,
        model_id: str,
        kind: ModelKind,
    ) -> None:
        self.controller = controller
        self.model_id = model_id
        self._requests: Queue = multiprocessing.Queue()
        self._replies: Queue = multiprocessing.Queue()
        self._process = multiprocessing.Process(
            target=serving_process_main,
            kwargs=dict(
                requests=self._requests,
                replies=self._replies,
                model_id=model_id,
                kind=kind,
            ),
            daemon=True,
        )
        self._process.start()

        # The model is loaded before the first completion is asked for, so this
        # waits out the load rather than the first caller doing it.
        error, _ = self._replies.get()
        if error is not None:
            raise ModelNotAvailable(f"{model_id} did not load: {error}")

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        self._requests.put((system, user, max_new_tokens))
        error, text = self._replies.get()
        if error is not None:
            raise ModelNotAvailable(f"{self.model_id} failed to answer: {error}")
        return text

    def status(self) -> str:
        return "serving"

    def cleanup(self) -> None:
        self._process.terminate()
        self._process.join()
        self._requests.close()
        self._replies.close()
        _log.info("unloaded %s — its process is gone", self.model_id)
