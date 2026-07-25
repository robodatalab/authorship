"""Backend API."""

import abc
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
    app.state.jobs = ParallelJobsManager()
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


class Job(abc.ABC):
    """A cancellable unit of work, keyed by the file it produces."""

    def __init__(self, target: str) -> None:
        self.target = target
        self.error: str | None = None
        self._cancel = threading.Event()
        self._begun = threading.Event()
        self._done = threading.Event()

    @property
    def cancelled(self) -> bool:
        return self._cancel.is_set()

    @property
    def done(self) -> bool:
        return self._done.is_set()

    @property
    def status(self) -> str:
        """Waiting for a worker, holding one, or finished with."""
        if self.done:
            return "done"
        return "running" if self._begun.is_set() else "pending"

    def cancel(self) -> None:
        self._cancel.set()

    def begin(self) -> None:
        self._begun.set()

    def finish(self) -> None:
        self._done.set()

    @abc.abstractmethod
    def execute(self) -> None:
        pass


class RepresentationBuildJob(Job):
    def __init__(self, model: InferenceModel, source: Path) -> None:
        super().__init__(str(graph_path_for(source)))
        self._model = model
        self._source = source
        self._markdown = source.read_text()

    def execute(self) -> None:
        graphs = _build_representations(self._model, self._markdown)
        if not self.cancelled:
            graph_path_for(self._source).write_text(to_yaml(graphs))


class GrammarFixJob(Job):
    def __init__(self, model: InferenceModel, source: Path) -> None:
        super().__init__(str(source))
        self._model = model
        self._markdown = source.read_text()
        self.result: str | None = None

    def execute(self) -> None:
        self.result = fix_grammar(self._model, self._markdown, lambda: self.cancelled)


class ParallelJobsManager:
    """The job in flight, or the last one finished, per target file. Starting a
    job for a target that already has one supersedes it — the newer write wins.
    A finished job lingers so its result can be polled, until it is replaced."""

    def __init__(self) -> None:
        self._pool = ThreadPoolExecutor()
        self._by_target: dict[str, Job] = {}
        self._lock = threading.Lock()

    def start(self, job: Job) -> Job:
        with self._lock:
            superseded = self._by_target.get(job.target)
            self._by_target[job.target] = job
        if superseded is not None:
            superseded.cancel()
        self._pool.submit(self._run, job)
        return job

    def get(self, target: str) -> Job | None:
        with self._lock:
            return self._by_target.get(target)

    def is_running(self, target: str) -> bool:
        job = self.get(target)
        return job is not None and not job.done

    def queued(self) -> list[Job]:
        """Every job still waiting for a worker or running on one."""
        with self._lock:
            return [job for job in self._by_target.values() if not job.done]

    def _run(self, job: Job) -> None:
        job.begin()
        try:
            job.execute()
        except Exception as err:
            job.error = str(err)
        finally:
            job.finish()


@app.get("/jobs")
def jobs() -> dict[str, Any]:
    """The work in hand: every unfinished job and the file it is queued on."""
    return {
        "jobs": [
            {"path": job.target, "status": job.status}
            for job in app.state.jobs.queued()
        ]
    }


@app.post("/build", status_code=202)
def build(request: RepresentationBuildRequest) -> dict[str, Any]:
    """Generate representations of a manuscript."""
    job = RepresentationBuildJob(app.state.completion_model, Path(request.path))
    app.state.jobs.start(job)
    return {"id": job.target, "path": job.target}


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


@app.post("/fix/grammar", status_code=202)
def fix_grammar_endpoint(request: GrammarFixRequest) -> dict[str, Any]:
    """Start correcting a manuscript; poll /fix/grammar/status for the text.

    A long document outlives an HTTP request, so the correction runs as a job.
    The corrected text is handed back once it is done rather than written: it is
    the author's own document, so the editor applies the change, where it can be
    reviewed and undone.
    """
    document = Path(request.path)
    if not document.is_file():
        raise HTTPException(
            status_code=400, detail=f"No such manuscript: {request.path}"
        )
    job = GrammarFixJob(app.state.grammar_model, document)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/fix/grammar/status")
def fix_grammar_status(id: str) -> dict[str, Any]:
    """Whether the grammar job is still running, and its text once it is done."""
    job = app.state.jobs.get(id)
    if not isinstance(job, GrammarFixJob):
        raise HTTPException(status_code=404, detail=f"No grammar job for {id}")
    return {"running": not job.done, "text": job.result, "error": job.error}
