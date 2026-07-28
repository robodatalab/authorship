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
from server.inference.utils import (
    gpu_memory_limit,
    gpu_memory_used,
    gpu_tensors,
    process_memory,
)
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
class MemoryReading:
    """What the serving process was holding, the last time it said so."""

    gpu_used: float
    gpu_limit: float
    process: float


@dataclass
class _ServingProcess:
    kind: ModelKind
    process: Process
    requests: Queue
    replies: Queue
    stop: Event
    # Readings the serving process volunteers, on their own queue: asking for
    # one would sit behind a generation that runs for minutes.
    readings: Queue


class InferenceModelResourceManager:

    def __init__(self) -> None:
        self._model_process_access_lock = threading.Lock()
        self._serving: _ServingProcess | None = None
        self._last_reading: MemoryReading | None = None

    @property
    def serving(self) -> ModelKind | None:
        """The model loaded right now, if any."""
        serving = self._serving
        return serving.kind if serving is not None else None

    def memory(self) -> MemoryReading:
        """What the process holding the model last reported.

        With no model loaded there is no such process, so this one answers for
        itself — the reading stays continuous either way, and reads as the near
        nothing the server holds on its own.
        """
        serving = self._serving
        if serving is None:
            return _memory_reading()
        while True:
            try:
                self._last_reading = serving.readings.get_nowait()
            except queue.Empty:
                return self._last_reading or _memory_reading()

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
        serving.readings.close()
        self._serving = None
        self._last_reading = None


    def _start_model_process(self, kind: ModelKind) -> None:
        requests: Queue = Queue()
        replies: Queue = Queue()
        readings: Queue = Queue()
        stop = multiprocessing.Event()

        process = Process(
            target=_serving_process_main,
            kwargs=dict(
                requests=requests,
                replies=replies,
                readings=readings,
                kind=kind,
                stop=stop,
            ),
            daemon=True,
        )
        process.start()

        error, _ = replies.get()
        if error is not None:
            process.join()
            raise ModelNotAvailable(f"{kind.model_id} did not load: {error}")

        self._serving = _ServingProcess(
            kind, process, requests, replies, stop, readings
        )

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

def _memory_reading() -> MemoryReading:
    return MemoryReading(gpu_memory_used(), gpu_memory_limit(), process_memory())


def _serving_process_main(
    requests: Queue,
    replies: Queue,
    readings: Queue,
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
    readings.put(_memory_reading())
    replies.put((None, None))
    _log.info("Serving %s", kind.model_id)

    while not stop.is_set():
        try:
            request = requests.get(timeout=REQUEST_POLL_S)
        except queue.Empty:
            readings.put(_memory_reading())
            continue
        try:
            reply = request(model, tokenizer)
            replies.put((None, reply))
        except Exception as err:
            replies.put((str(err), None))

    del model
    del tokenizer
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()
    _log_memory_usage(kind)
    _log.info("Stopped serving %s", kind.model_id)
