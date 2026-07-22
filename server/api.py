"""Backend API."""

from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
import threading
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from server import log
from server.representations.plot_representation import build_plot_representation
from server.representations.scene_representation import build_scene_representation
from server.representations.utils import graph_path_for
from server.story_graph import to_yaml
from server.inference.completion import CompletionModel, ModelNotAvailable
import tenacity

_log = log.logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _log.info("Starting a CompletionModel")
    app.state.completion_model = CompletionModel()
    app.state.jobs = ParallelBuildJobsManager()
    _log.info("CompletionModel created")

    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    """Is the application healthy and ready to serve traffic"""
    inference_server_status = app.state.completion_model.status()
    return {
        "inference_server_status": inference_server_status,
    }


class RepresentationBuildRequest(BaseModel):
    # Path of the document
    path: str


@tenacity.retry(
    retry=tenacity.retry_if_exception_type((ValueError, ModelNotAvailable)),
    wait=tenacity.wait_exponential_jitter(initial=1, max=30),
    stop=tenacity.stop_after_attempt(5),
    reraise=True,
)
def _build_representations(model, markdown):
    return [
        build_scene_representation(model, markdown),
        build_plot_representation(model, markdown),
    ]


class BuildJob:
    """One build of one manuscript: runnable, cancellable, self-removing."""

    def __init__(
        self,
        path: str,
        model: CompletionModel,
        markdown: str,
        jobs_manager: "ParallelBuildJobsManager",
    ) -> None:
        self.path = path
        self._model = model
        self._markdown = markdown
        self._jobs_manager = jobs_manager
        self._cancel = threading.Event()

    @property
    def cancelled(self) -> bool:
        return self._cancel.is_set()

    def cancel(self) -> None:
        self._cancel.set()

    def run(self) -> None:
        try:
            graphs = _build_representations(self._model, self._markdown)
            if not self.cancelled:
                graph_path_for(Path(self.path)).write_text(to_yaml(graphs))
        finally:
            self._jobs_manager.remove(self)


class ParallelBuildJobsManager:
    """The in-flight build per path. Starting one for a path that already has a
    job cancels that job first."""

    def __init__(self) -> None:
        self._pool = ThreadPoolExecutor()
        self._by_path: dict[str, BuildJob] = {}
        self._lock = threading.Lock()

    def start(self, path: str, model: CompletionModel, markdown: str) -> BuildJob:
        job = BuildJob(path, model, markdown, self)
        with self._lock:
            superseded = self._by_path.get(path)
            self._by_path[path] = job
        if superseded is not None:
            superseded.cancel()
        self._pool.submit(job.run)
        return job

    def is_running(self, path: str) -> bool:
        with self._lock:
            return path in self._by_path

    def remove(self, job: BuildJob) -> None:
        with self._lock:
            if self._by_path.get(job.path) is job:
                del self._by_path[job.path]


@app.post("/build", status_code=202)
def build(request: RepresentationBuildRequest) -> dict[str, Any]:
    """Generate representations of a manuscript."""
    document = Path(request.path)
    story_markdown = document.read_text()
    target_graph_file = graph_path_for(document)

    job = app.state.jobs.start(
        str(document), app.state.completion_model, story_markdown
    )
    return {"id": job.path, "path": str(target_graph_file)}


@app.get("/build/status")
def build_status(id: str) -> dict[str, Any]:
    return {"running": app.state.jobs.is_running(id)}
