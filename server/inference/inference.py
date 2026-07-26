from dataclasses import dataclass
import gc
import multiprocessing
from multiprocessing import Process, Queue
from multiprocessing.synchronize import Event
import queue
import os
import threading
from contextlib import contextmanager
from typing import Generator

from server import log
from server.inference.kinds import ModelKind
from server.inference.utils import (gpu_memory_used, gpu_tensors, gpu_memory_limit)
import torch

_log = log.logger(__name__)
os.environ.setdefault("HF_DEACTIVATE_ASYNC_LOAD", "1")

REQUEST_POLL_S = 0.1
STOP_GRACE_S = 30.0


class ModelNotAvailable(Exception):
    pass


def _log_memory_usage(kind: ModelKind) -> None:
    _log.info(
            "serving %s: tensors %.1fGB, driver %.1fGB, limit %.1fGB",
            kind.model_id,
            gpu_tensors(), 
            gpu_memory_used(),
            gpu_memory_limit(),
        )


@dataclass
class _ServingProcess:
    kind: ModelKind
    process: Process
    requests: Queue
    replies: Queue
    stop: Event


class InferenceModelResourceManager:

    def __init__(self) -> None:
        self._model_process_access_lock = threading.Lock()
        self._serving: _ServingProcess | None = None

    def _stop_model_process(self) -> None:
        serving = self._serving
        if serving is None:
            return

        serving.stop.set()
        serving.process.join(timeout=STOP_GRACE_S)

        if serving.process.is_alive():
            # Whatever it is doing, its memory is needed now.
            _log.warning("%s did not stop; killing it", serving.kind.model_id)
            serving.process.terminate()
            serving.process.join()

        _log_memory_usage(serving.kind)

        serving.requests.close()
        serving.replies.close()
        self._serving = None


    def _start_model_process(self, kind: ModelKind) -> None:        
        requests: Queue = Queue()
        replies: Queue = Queue()
        stop = multiprocessing.Event()

        process = Process(
            target=_serving_process_main,
            kwargs=dict(requests=requests, replies=replies, kind=kind, stop=stop),
            daemon=True,
        )
        process.start()

        error, _ = replies.get()
        if error is not None:
            process.join()
            raise ModelNotAvailable(f"{kind.model_id} did not load: {error}")

        self._serving = _ServingProcess(kind, process, requests, replies, stop)


    @contextmanager
    def residency(
        self, 
        kind: ModelKind,
    ) -> Generator[tuple[Queue, Queue], None, None]:
        with self._model_process_access_lock:
            if self._serving is None or self._serving.kind != kind:
                self._stop_model_process()
                self._start_model_process(kind)
            serving = self._serving

        if serving is None:
            raise ModelNotAvailable(f"{kind.model_id} did not start serving") 
        
        yield serving.requests, serving.replies


def _serving_process_main(
    requests: Queue,
    replies: Queue,
    kind: ModelKind,
    stop: Event,
) -> None:
    """Child process: hold the model and answer completions until it is killed."""
    log.setup()

    _log.info("Preparing %s for serving ...", kind.model_id)
    try:
        model, tokenizer = kind.load()
    except Exception as err:
        replies.put((str(err), None))
        return

    _log_memory_usage(kind)
    replies.put((None, None))
    _log.info("Serving %s", kind.model_id)

    while not stop.is_set():
        try:
            request = requests.get(timeout=REQUEST_POLL_S)
        except queue.Empty:
            continue
        try:
            replies.put(
                (
                    None,
                    kind.complete(
                        model,
                        tokenizer,
                        request.system,
                        request.user,
                        request.max_new_token,
                    ),
                )
            )
        except Exception as err:
            replies.put((str(err), None))

    del model
    del tokenizer
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
    _log_memory_usage(kind)
    _log.info("Stopped serving %s", kind.model_id)



@dataclass
class CompleteRequest:
    system: str
    user: str
    max_new_token: int


class InferenceModel:
    def __init__(
        self,
        kind: ModelKind,
        manager: InferenceModelResourceManager,
    ) -> None:
        self.kind = kind
        self.manager = manager

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        with self.manager.residency(self.kind) as (requests, replies):
            requests.put(CompleteRequest(system, user, max_new_tokens))
            error, text = replies.get()
        if error is not None:
            raise ModelNotAvailable(f"{str(self.kind)} failed to answer: {error}")
        return text

