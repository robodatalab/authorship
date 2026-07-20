"""The HTTP surface. Holds no weights — those live in the worker process, so the
event loop is never starved and /health always answers immediately."""

import multiprocessing as mp
import queue
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

#: How long the status thread waits on the queue before looking at the child
#: itself. Long enough to be free, short enough that a death is noticed while
#: you are still watching the terminal.
WATCH_INTERVAL_S = 5.0


class Superseded(Exception):
    """Raised inside a build that a newer save has taken the manuscript from."""


class Worker:
    """Handle on the child process that owns the model."""

    def __init__(self, model_id: str) -> None:
        self.status = STARTING
        self._since = time.monotonic()

        # `spawn` rather than `fork`: forking a process that has already imported
        # torch is unsafe, and it is the default on macOS anyway.
        context = mp.get_context("spawn")
        self._status: Queue[str] = context.Queue()
        self._requests: Queue[dict[str, Any] | None] = context.Queue()
        self._responses: Queue[str] = context.Queue()
        self._lock = threading.Lock()

        # Synchronization primitives cross a spawn boundary by inheritance only,
        # so the interrupt is created here and handed over at construction.
        self._interrupt = context.Event()

        #: Who the generation in flight belongs to, and a mutex of its own so
        #: `interrupt` can read it without waiting for the generation to end —
        #: `_lock` is held for the whole call, which is precisely the span an
        #: interrupt has to reach into.
        self._owner: "Build | None" = None
        self._guard = threading.Lock()

        # `daemon` so the child cannot outlive the server: Python terminates
        # daemonic children when the parent exits.
        self._process: BaseProcess = context.Process(
            target=worker.run,
            args=(
                model_id,
                self._status,
                self._requests,
                self._responses,
                self._interrupt,
            ),
            daemon=True,
        )
        self._process.start()
        _log.info("spawned worker pid %s for %s", self._process.pid, model_id)

        threading.Thread(target=self._track_status, daemon=True).start()

    @property
    def pid(self) -> int | None:
        return self._process.pid

    @property
    def alive(self) -> bool:
        return self._process.is_alive()

    @property
    def seconds_in_status(self) -> float:
        return time.monotonic() - self._since

    def _track_status(self) -> None:
        """Mirror the child's progress, and notice when it stops reporting.

        The read is on a timeout rather than blocking outright. Blocking was
        correct as far as it went — the status only ever moves forward, so
        silence means unchanged — but it made silence and death identical, and
        a child that died mid-load left the parent saying `loading` forever.
        """
        while True:
            try:
                published = self._status.get(timeout=WATCH_INTERVAL_S)
            except queue.Empty:
                self._check_alive()
                continue

            _log.info(
                "worker: %s -> %s after %.1fs",
                self.status,
                published,
                self.seconds_in_status,
            )
            self.status = published
            self._since = time.monotonic()

    def _check_alive(self) -> None:
        """Called whenever the child has been quiet for a while."""
        if self.status in (STOPPED, worker.FAILED):
            return

        if not self.alive:
            _log.error(
                "worker pid %s is gone, last said %s %.0fs ago",
                self._process.pid,
                self.status,
                self.seconds_in_status,
            )
            self.status = worker.FAILED
            self._since = time.monotonic()
            return

        # Alive and quiet is normal once ready — it is only worth remarking on
        # while something is supposed to be happening.
        if self.status != worker.READY:
            _log.info(
                "worker pid %s still %s after %.0fs",
                self._process.pid,
                self.status,
                self.seconds_in_status,
            )

    def infer(
        self, prompt: str, max_new_tokens: int, owner: "Build | None" = None
    ) -> str:
        """`owner` is who the answer is for, so `interrupt` can end this
        generation and not whichever one has started by the time it is called."""
        # One at a time: there is one model on one GPU, and interleaving requests
        # on a single pipe would mismatch replies with callers.
        waiting = time.monotonic()
        with self._lock:
            queued = time.monotonic() - waiting
            if queued > 1.0:
                _log.info("waited %.1fs for the model to be free", queued)

            with self._guard:
                # Clearing here, with the queue to ourselves, is what keeps an
                # interrupt meant for the previous call off this one.
                self._interrupt.clear()
                self._owner = owner
                # Abandoned while it waited for the model: the flag goes up
                # before the request does, and the first token ends it.
                if owner is not None and owner.abandoned:
                    self._interrupt.set()

            self._requests.put({"prompt": prompt, "max_new_tokens": max_new_tokens})
            reply = self._responses.get()

            with self._guard:
                self._owner = None

        _log.info(
            "inference returned %d chars after %.1fs",
            len(reply),
            time.monotonic() - waiting,
        )
        return reply

    def interrupt(self, owner: "Build") -> None:
        """Stop the generation running for `owner` — if it is still that one."""
        with self._guard:
            if self._owner is owner:
                self._interrupt.set()

    def stop(self) -> None:
        """Shut the child down, escalating until it is actually gone."""
        self.status = STOPPED

        if not self._process.is_alive():
            _log.info("worker pid %s was already gone", self._process.pid)
            return

        _log.info("asking worker pid %s to stop", self._process.pid)
        self._requests.put(None)
        self._process.join(DRAIN_TIMEOUT_S)

        if self._process.is_alive():
            _log.warning(
                "worker ignored the sentinel for %.0fs, terminating", DRAIN_TIMEOUT_S
            )
            self._process.terminate()
            self._process.join(TERMINATE_TIMEOUT_S)

        if self._process.is_alive():
            _log.warning("worker survived terminate, killing")
            self._process.kill()
            self._process.join()

        _log.info("worker stopped")


class Build:
    """One reading of one manuscript, and the one thing done to it from outside:
    giving up on it.

    A build is an answer about the file as it was when the build started. The
    next save makes that file historical, so the build in flight stops being
    anybody's answer — it is abandoned rather than left to finish, because
    finishing means overwriting the graph with a reading of a draft that no
    longer exists.

    It is also the `Infer` the perspectives are handed, which is why they never
    hear about any of this: abandonment surfaces as an exception out of the
    inference they were already making.
    """

    def __init__(self, path: Path, model: Worker) -> None:
        self.path = path
        self._model = model
        self._abandoned = threading.Event()

    @property
    def abandoned(self) -> bool:
        return self._abandoned.is_set()

    def abandon(self) -> None:
        self._abandoned.set()
        self._model.interrupt(self)

    def check(self) -> None:
        if self.abandoned:
            raise Superseded(f"a newer save took over {self.path.name}")

    def infer(self, prompt: str, max_new_tokens: int) -> str:
        self.check()
        reply = self._model.infer(prompt, max_new_tokens, owner=self)
        # An interrupted generation stops mid-sentence, so the check comes before
        # anything tries to read the reply as an answer.
        self.check()
        return reply


class Builds:
    """Which build owns each manuscript.

    Starting one abandons whatever was reading the same file, so the newest save
    is the one that gets written. Builds of different manuscripts are left alone:
    they write different files, and the model serializes them regardless.
    """

    def __init__(self, model: Worker) -> None:
        self._model = model
        self._lock = threading.Lock()
        self._current: dict[Path, Build] = {}

    def start(self, path: Path) -> Build:
        current = Build(path, self._model)
        with self._lock:
            previous = self._current.get(path)
            self._current[path] = current

        # Outside the lock: abandoning reaches into the child process, and this
        # lock is only here to decide who is current.
        if previous is not None:
            _log.info("abandoning the build of %s, a newer save arrived", path.name)
            previous.abandon()
        return current

    def finish(self, build: Build) -> None:
        """Retire a build, unless a newer one has already taken the file over."""
        with self._lock:
            if self._current.get(build.path) is build:
                del self._current[build.path]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    instance = Worker(MODEL)
    app.state.worker = instance
    app.state.builds = Builds(instance)
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
    configuration. Mirrors `graphPathFor` in extension/story_graph/model.ts."""
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
def health() -> dict[str, Any]:
    """Answers in every state, including mid-download. This is what the frontend
    polls, so it must never touch the model or the queues.

    It carries more than the status word because that word alone could not
    distinguish a worker still loading from one that died saying `loading`.
    """
    instance: Worker = app.state.worker
    return {
        "status": instance.status,
        "model": MODEL,
        "pid": instance.pid,
        "alive": instance.alive,
        "seconds": round(instance.seconds_in_status, 1),
    }


@app.post("/run")
def run(request: RunRequest) -> dict[str, str]:
    instance: Worker = app.state.worker
    if instance.status != worker.READY:
        raise HTTPException(status_code=503, detail=f"Model is {instance.status}.")
    return {"output": instance.infer(request.prompt, request.max_new_tokens)}


@app.post("/build")
def build(request: BuildRequest) -> dict[str, Any]:
    """Run every perspective over the manuscript and write the layered file.

    Saving again while this is running hands the manuscript to the newer build:
    this one stops generating wherever it had got to, writes nothing, and says
    so. The writer's last save is the one that reaches the graph.
    """
    instance: Worker = app.state.worker
    if instance.status != worker.READY:
        # Saving during a load takes this path, so it says which save was
        # refused and why rather than only appearing as a 503 in the access log.
        _log.info(
            "refused build of %s: worker is %s (%.0fs)",
            Path(request.path).name,
            instance.status,
            instance.seconds_in_status,
        )
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

    registry: Builds = app.state.builds
    current = registry.start(document)
    try:
        graphs = []
        for perspective in perspectives(current.infer):
            name = type(perspective).__name__
            at = time.monotonic()
            try:
                graph = perspective.process(story_markdown)
            except ValueError as error:
                # An unusable reply leaves the existing graph file alone.
                _log.warning(
                    "%s failed after %.1fs: %s", name, time.monotonic() - at, error
                )
                raise HTTPException(status_code=502, detail=str(error)) from error
            _log.info(
                "%s produced %d nodes, %d edges in %.1fs",
                name,
                len(graph.nodes),
                len(graph.edges),
                time.monotonic() - at,
            )
            graphs.append(graph)

        # Between perspectives as well as inside them: a build abandoned after
        # its last reply arrived is still not the one that gets to write.
        current.check()

        target = graph_path_for(document)
        target.write_text(story_graph.to_yaml(graphs), encoding="utf-8")
        _log.info(
            "wrote %s, %d layers, build took %.1fs",
            target.name,
            len(graphs),
            time.monotonic() - started,
        )
    except Superseded as error:
        _log.info(
            "gave up on %s after %.1fs: %s",
            document.name,
            time.monotonic() - started,
            error,
        )
        raise HTTPException(status_code=409, detail=str(error)) from None
    finally:
        registry.finish(current)

    return {
        "path": str(target),
        "layers": [
            {"nodes": len(graph.nodes), "edges": len(graph.edges)} for graph in graphs
        ],
    }
