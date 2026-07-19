"""The HTTP surface. Holds no weights — those live in the worker process, so the
event loop is never starved and /health always answers immediately."""

import multiprocessing as mp
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from multiprocessing.process import BaseProcess
from multiprocessing.queues import Queue
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from . import worker

MODEL = "Qwen/Qwen3.5-4B"

STARTING = "starting"
STOPPED = "stopped"

#: How long to wait for the worker to finish the request it is on, then to die.
DRAIN_TIMEOUT_S = 30.0
TERMINATE_TIMEOUT_S = 5.0


class Worker:
    """Handle on the child process that owns the model."""

    def __init__(self, model_id: str) -> None:
        self.status = STARTING

        # `spawn` rather than `fork`: forking a process that has already imported
        # torch is unsafe, and it is the default on macOS anyway.
        context = mp.get_context("spawn")
        self._status: Queue[str] = context.Queue()
        self._requests: Queue[dict[str, Any] | None] = context.Queue()
        self._responses: Queue[str] = context.Queue()
        self._lock = threading.Lock()

        # `daemon` so the child cannot outlive the server: Python terminates
        # daemonic children when the parent exits.
        self._process: BaseProcess = context.Process(
            target=worker.run,
            args=(model_id, self._status, self._requests, self._responses),
            daemon=True,
        )
        self._process.start()

        threading.Thread(target=self._track_status, daemon=True).start()

    def _track_status(self) -> None:
        """Mirror the child's progress. Reads tiny strings, so it never competes
        for the GIL with anything that matters."""
        while True:
            self.status = self._status.get()

    def infer(self, prompt: str, max_new_tokens: int) -> str:
        # One at a time: there is one model on one GPU, and interleaving requests
        # on a single pipe would mismatch replies with callers.
        with self._lock:
            self._requests.put({"prompt": prompt, "max_new_tokens": max_new_tokens})
            return self._responses.get()

    def stop(self) -> None:
        """Shut the child down, escalating until it is actually gone."""
        self.status = STOPPED

        if not self._process.is_alive():
            return

        self._requests.put(None)
        self._process.join(DRAIN_TIMEOUT_S)

        if self._process.is_alive():
            self._process.terminate()
            self._process.join(TERMINATE_TIMEOUT_S)

        if self._process.is_alive():
            self._process.kill()
            self._process.join()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    instance = Worker(MODEL)
    app.state.worker = instance
    try:
        yield
    finally:
        instance.stop()


class RunRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 1024


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": app.state.worker.status, "model": MODEL}


@app.post("/run")
def run(request: RunRequest) -> dict[str, str]:
    instance: Worker = app.state.worker
    if instance.status != worker.READY:
        raise HTTPException(status_code=503, detail=f"Model is {instance.status}.")
    return {"output": instance.infer(request.prompt, request.max_new_tokens)}
