"""Backend API."""

import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

import tenacity
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.epub_exporter import build_epub
from server.grammar import fix_grammar
from server.inference.inference import (
    InferenceModel,
    InferenceModelResourceManager,
    ModelNotAvailable,
)
from server.inference.kinds import CausalModel, Seq2SeqModel
from server.inference.utils import coedit_prompt, qwen_chat_prompt
from server.representations.character_representation import (
    build_character_representation,
)
from server.representations.plot_representation import build_plot_representation
from server.representations.scene_representation import build_scene_representation
from server.representations.utils import graph_path_for
from server.story_graph import to_yaml

_log = log.logger(__name__)


CLASSIFIER_MODEL = "Qwen/Qwen3.5-4B"
GRAMMAR_MODEL = "grammarly/coedit-xl"

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _log.info("Starting the completion models")
    app.state.models = InferenceModelResourceManager()
    app.state.completion_model = InferenceModel(
        CLASSIFIER_MODEL, CausalModel(qwen_chat_prompt), app.state.models
    )
    app.state.grammar_model = InferenceModel(
        GRAMMAR_MODEL, Seq2SeqModel(coedit_prompt), app.state.models
    )
    app.state.inference_models = [
        app.state.completion_model,
        app.state.grammar_model,
    ]
    app.state.jobs = ParallelBuildJobsManager()
    _log.info("Completion models created")

    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    """Is the application healthy and ready to serve traffic"""
    resident = app.state.models.resident
    status = resident.status() if resident is not None else "unloaded"
    return {
        "inference_server_status": status,
    }


@app.get("/models")
def models() -> dict[str, Any]:
    """Every inference model and which one currently holds the GPU."""
    resident = app.state.models.resident
    return {
        "models": [
            {"model": m.model_id, "status": m.status(), "resident": m is resident}
            for m in app.state.inference_models
        ]
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
        build_character_representation(model, markdown),
    ]


class BuildJob:
    """One build of one manuscript: runnable, cancellable, self-removing."""

    def __init__(
        self,
        path: str,
        model: InferenceModel,
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

    def start(self, path: str, model: InferenceModel, markdown: str) -> BuildJob:
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


class EpubExportRequest(BaseModel):
    # Path of the manuscript to publish.
    path: str
    # Falls back to the title detected in the manuscript when omitted.
    title: str | None = None
    author: str = ""
    language: str = "en"
    # Path of a cover image, or None for a coverless book.
    cover: str | None = None


@app.post("/export/epub")
def export_epub(request: EpubExportRequest) -> dict[str, Any]:
    """Export a manuscript to an EPUB written beside it, as `<name>.epub`."""
    document = Path(request.path)
    if not document.is_file():
        raise HTTPException(
            status_code=400, detail=f"No such manuscript: {request.path}"
        )

    out_path = document.with_suffix(".epub")
    cover = Path(request.cover) if request.cover else None
    build_epub(
        document,
        out_path,
        cover,
        request.title,
        request.author,
        request.language,
    )
    return {"path": str(out_path)}


class GrammarFixRequest(BaseModel):
    # Path of the manuscript to correct.
    path: str


@app.post("/fix/grammar")
def fix_grammar_endpoint(request: GrammarFixRequest) -> dict[str, Any]:
    """Correct a manuscript's spelling and grammar, returning the new text.

    The corrected text is handed back rather than written: it is the author's own
    document, so the editor applies the change, where it can be reviewed and
    undone. A 503 says the model is not ready yet, the one thing worth retrying.
    """
    document = Path(request.path)
    if not document.is_file():
        raise HTTPException(
            status_code=400, detail=f"No such manuscript: {request.path}"
        )

    try:
        corrected = fix_grammar(app.state.grammar_model, document.read_text())
    except ModelNotAvailable as err:
        raise HTTPException(status_code=503, detail=str(err))
    return {"text": corrected}
