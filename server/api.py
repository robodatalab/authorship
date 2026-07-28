"""Backend API."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

import tenacity
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.epub_exporter import build_epub
from server.grammar import fix_grammar
from server.inference import (
    InferenceModelResourceManager,
    ModelNotAvailable,
    CausalModel, Seq2SeqModel,
    coedit_prompt, machine_memory, qwen_chat_prompt
)
from server.jobs import Job, ParallelJobsManager
from server.representations import (
    build_character_representation,
    build_plot_representation,
    build_scene_representation,
    graph_path_for
)
from server.story_graph import to_yaml

_log = log.logger(__name__)


CLASSIFIER_MODEL = "Qwen/Qwen3.5-4B"
GRAMMAR_MODEL = "grammarly/coedit-xl"

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _log.info("Starting the completion models")
    app.state.models = InferenceModelResourceManager()
    app.state.completion_model = CausalModel(
        CLASSIFIER_MODEL, qwen_chat_prompt, app.state.models
    )
    app.state.grammar_model = Seq2SeqModel(
        GRAMMAR_MODEL, coedit_prompt, app.state.models
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
    serving = app.state.models.serving
    return {
        "inference_server_status": "unloaded" if serving is None else "serving",
    }


@app.get("/models")
def models() -> dict[str, Any]:
    """Every inference model, and which one is loaded."""
    serving = app.state.models.serving
    return {
        "models": [
            {
                "model": model.model_id,
                "status": "serving" if model == serving else "unloaded",
                "resident": model == serving,
            }
            for model in app.state.inference_models
        ]
    }


@app.get("/memory")
def memory() -> dict[str, Any]:
    """What the model is holding, against what the machine has.

    The model runs in a process of its own, so these are its readings, taken
    when it last had a moment between requests — not the server's.
    """
    serving = app.state.models.serving
    reading = app.state.models.memory()
    return {
        "gpu": {"used": reading.gpu_used, "limit": reading.gpu_limit},
        "process": reading.process,
        "machine": machine_memory(),
        "serving": None if serving is None else serving.model_id,
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



class RepresentationBuildJob(Job):
    kind = "representation build"

    def __init__(self, model: CausalModel, source: Path) -> None:
        super().__init__(str(graph_path_for(source)))
        self._model = model
        self._source = source
        self._markdown = source.read_text()

    def execute(self) -> None:
        graphs = _build_representations(self._model, self._markdown)
        if not self.cancelled:
            graph_path_for(self._source).write_text(to_yaml(graphs))


class GrammarFixJob(Job):
    kind = "grammar fix"

    def __init__(self, model: Seq2SeqModel, source: Path) -> None:
        super().__init__(str(source))
        self._model = model
        self._source = source
        self._markdown = source.read_text()

    def execute(self) -> None:
        corrected = fix_grammar(self._model, self._markdown, lambda: self.cancelled)
        if not self.cancelled:
            self._source.write_text(corrected)



@app.get("/jobs")
def jobs() -> dict[str, Any]:
    """The work in hand: every unfinished job and the file it is queued on."""
    return {
        "jobs": [
            {"kind": job.kind, "path": job.target, "status": job.status}
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
    """Start correcting a manuscript; poll /fix/grammar/status for the end of it.

    A long document outlives an HTTP request, so the correction runs as a job,
    and writes the manuscript back when it is done.
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
    """Whether the grammar job is still running; the manuscript is its result."""
    job = app.state.jobs.get(id)
    if not isinstance(job, GrammarFixJob):
        raise HTTPException(status_code=404, detail=f"No grammar job for {id}")
    return {"running": not job.done, "error": job.error}
