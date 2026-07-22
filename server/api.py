"""Backend API."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
import threading
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.representations.plot_representation import build_plot_representation
from server.representations.scene_representation import build_scene_representation
from server.representations.utils import graph_path_for
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

    def run(self) -> list:
        try:
            return _build_representations(self._model, self._markdown)
        finally:
            self._jobs_manager.remove(self)


class ParallelBuildJobsManager:
    """The in-flight build per path. Starting one for a path that already has a
    job cancels that job first."""

    def __init__(self) -> None:
        self._by_path: dict[str, BuildJob] = {}
        self._lock = threading.Lock()

    def start(self, path: str, model: CompletionModel, markdown: str) -> BuildJob:
        job = BuildJob(path, model, markdown, self)
        with self._lock:
            superseded = self._by_path.get(path)
            self._by_path[path] = job
        if superseded is not None:
            superseded.cancel()
        return job

    def remove(self, job: BuildJob) -> None:
        with self._lock:
            if self._by_path.get(job.path) is job:
                del self._by_path[job.path]


@app.post("/build")
def build(request: RepresentationBuildRequest) -> dict[str, Any]:
    """Generate representations of a manuscript."""
    document = Path(request.path)
    story_markdown = document.read_text()
    target_graph_file = graph_path_for(document)

    job = app.state.jobs.start(
        str(document), app.state.completion_model, story_markdown
    )
    graphs = job.run()

    if job.cancelled:
        raise HTTPException(status_code=403, detail="superseded by a newer build")

    return {
        "path": str(target_graph_file),
        "layers": [
            {"nodes": len(graph.nodes), "edges": len(graph.edges)} for graph in graphs
        ],
    }
