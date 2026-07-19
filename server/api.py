"""The HTTP surface. Holds no weights — those live in the worker process, so the
event loop is never starved and /health always answers immediately."""

import multiprocessing as mp
import re
import threading
import time
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from multiprocessing.process import BaseProcess
from multiprocessing.queues import Queue
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from . import log, story_graph, worker
from .perspectives import Infer, ScenePerspective
from .story_graph import StoryPerspective

MODEL = "Qwen/Qwen3.5-4B"

_log = log.logger(__name__)

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


def perspectives(infer: Infer) -> Sequence[StoryPerspective]:
    """The readings of a story we build, in the order they become layers.

    Hardcoded: there is one, and choosing between them is not yet a question
    anyone is asking.
    """
    return [ScenePerspective(infer)]


def graph_path_for(document: Path) -> Path:
    """`story.md` sits next to `story.graph.yaml` — by convention, not
    configuration. Mirrors `graphPathFor` in src/story_graph/model.ts."""
    stem = re.sub(r"\.md$", "", document.name, flags=re.I)
    return document.with_name(stem + ".graph.yaml")


class RunRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 1024


class BuildRequest(BaseModel):
    #: The manuscript. The server reads it, so there is one answer to what "the
    #: file" means and the prose stays out of the request.
    path: str


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


@app.post("/build")
def build(request: BuildRequest) -> dict[str, Any]:
    """Run every perspective over the manuscript and write the layered file."""
    instance: Worker = app.state.worker
    if instance.status != worker.READY:
        raise HTTPException(status_code=503, detail=f"Model is {instance.status}.")

    document = Path(request.path)
    try:
        story_markdown = document.read_text(encoding="utf-8")
    except OSError as error:
        _log.warning("cannot read %s: %s", document, error)
        raise HTTPException(status_code=400, detail=str(error)) from error

    _log.info(
        "build %s (%d lines)", document.name, len(story_markdown.splitlines())
    )
    started = time.monotonic()

    graphs = []
    for perspective in perspectives(instance.infer):
        name = type(perspective).__name__
        at = time.monotonic()
        try:
            graph = perspective.process(story_markdown)
        except ValueError as error:
            # An unusable reply leaves the existing graph file alone.
            _log.warning("%s failed after %.1fs: %s", name, time.monotonic() - at, error)
            raise HTTPException(status_code=502, detail=str(error)) from error
        _log.info(
            "%s produced %d nodes, %d edges in %.1fs",
            name,
            len(graph.nodes),
            len(graph.edges),
            time.monotonic() - at,
        )
        graphs.append(graph)

    target = graph_path_for(document)
    target.write_text(story_graph.to_yaml(graphs), encoding="utf-8")
    _log.info(
        "wrote %s, %d layers, build took %.1fs",
        target.name,
        len(graphs),
        time.monotonic() - started,
    )

    return {
        "path": str(target),
        "layers": [
            {"nodes": len(graph.nodes), "edges": len(graph.edges)} for graph in graphs
        ],
    }
