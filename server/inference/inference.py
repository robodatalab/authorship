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
from transformers import AutoTokenizer, PreTrainedTokenizerBase

_log = log.logger(__name__)
os.environ.setdefault("HF_DEACTIVATE_ASYNC_LOAD", "1")

DOWNLOADED = "downloaded"


class ModelNotAvailable(Exception):
    pass


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


class InferenceModelResourceManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ready = threading.Condition()
        self._resident: "InferenceModel | None" = None

    @property
    def resident(self) -> "InferenceModel | None":
        return self._resident

    def wake(self) -> None:
        with self._ready:
            self._ready.notify_all()

    @contextmanager
    def residency(self, model: "InferenceModel") -> Generator[None, None, None]:
        with self._lock:
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

    _log.info("download complete, loading %s in-process", model_id)
    controller = loading.controller
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = controller.kind.load(model_id)
    controller.set_state(InferenceModelServing(controller, model, tokenizer))


class InferenceModelServing(InferenceModelState):
    def __init__(
        self,
        controller: InferenceModel,
        model,
        tokenizer: PreTrainedTokenizerBase,
    ) -> None:
        self.controller = controller
        self.model = model
        self.tokenizer = tokenizer

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        return self.controller.kind.complete(
            self.model, self.tokenizer, system, user, max_new_tokens
        )

    def status(self) -> str:
        return "serving"

    def cleanup(self) -> None:
        del self.model
        del self.tokenizer
        torch.mps.empty_cache()
