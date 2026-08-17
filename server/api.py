"""Backend API."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.publishing import authorship
from server.publishing.epub_exporter import build_epub
from server.writing_tools.blurb import write_blurb
from server.writing_tools.grammar import correct_span
from vramen import (
    InferenceModelResourceManager,
    Seq2SeqModel,
    coedit_prompt, machine_memory
)
from server.jobs import Job, ParallelJobsManager
from server.storydoc import Document

_log = log.logger(__name__)


GRAMMAR_MODEL = "grammarly/coedit-xl"

# What the model was measured holding over a single batch, and what it is allowed.
GRAMMAR_MODEL_GB = 5.0
MEMORY_QUOTA_GB = 11.0

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _log.info("Starting the completion models")
    app.state.models = InferenceModelResourceManager(MEMORY_QUOTA_GB)
    app.state.grammar_model = Seq2SeqModel(
        GRAMMAR_MODEL, coedit_prompt, app.state.models, GRAMMAR_MODEL_GB
    )
    app.state.inference_models = [app.state.grammar_model]
    app.state.jobs = ParallelJobsManager()
    _log.info("Completion models created")

    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    """Is the application healthy and ready to serve traffic"""
    residents = app.state.models.residents
    return {
        "inference_server_status": "unloaded" if not residents else "serving",
    }


@app.get("/models")
def models() -> dict[str, Any]:
    """Every inference model, and which of them are loaded."""
    residents = app.state.models.residents
    return {
        "models": [
            {
                "model": model.model_id,
                "status": "serving" if model in residents else "unloaded",
                "resident": model in residents,
            }
            for model in app.state.inference_models
        ]
    }


@app.get("/memory")
def memory() -> dict[str, Any]:
    """What the models are holding, against what the machine has.

    Each model runs in a process of its own, so these are their readings added
    together, each taken when that model last had a moment between requests —
    not the server's.
    """
    residents = app.state.models.residents
    reading = app.state.models.memory()
    return {
        "gpu": {"used": reading.gpu_used, "limit": reading.gpu_limit},
        "process": reading.process,
        "machine": machine_memory(),
        "serving": ", ".join(model.model_id for model in residents) or None,
    }


def _document(path: str) -> Document:
    target = Path(path)
    if not target.is_file():
        raise HTTPException(status_code=400, detail=f"No such document: {path}")
    return Document.load(target)


class GrammarFixJob(Job):
    kind = "grammar fix"

    def __init__(
        self, model: Seq2SeqModel, document: Document, start: int, end: int
    ) -> None:
        super().__init__(str(document.path))
        self._model = model
        self._document = document
        self._start = start
        self._end = end

    def execute(self) -> None:
        correct_span(
            self._model,
            self._document,
            self._start,
            self._end,
            lambda: self.cancelled,
        )
        if not self.cancelled:
            self._document.save()



@app.get("/jobs")
def jobs() -> dict[str, Any]:
    """The work in hand: every unfinished job and the file it is queued on."""
    return {
        "jobs": [
            {"kind": job.kind, "path": job.target, "status": job.status}
            for job in app.state.jobs.queued()
        ]
    }


class EpubExportRequest(BaseModel):
    # Path of the document to publish. What the book says about itself — its
    # title page, its cover, its disclaimer, where to find the author — is in
    # the document's own cells.
    path: str


@app.get("/authorship")
def read_authorship(path: str) -> dict[str, Any]:
    """What the book beside `path` says about itself.

    The panel asks rather than parsing: the format is the server's, and a second
    reader of it is a second thing to keep in step.
    """
    document = _document(path)
    assert document.path is not None
    book = authorship.load(authorship.path_beside(document.path))
    return {"wordsPerPart": book.words_per_part}


@app.post("/export/epub")
def export_epub(request: EpubExportRequest) -> dict[str, Any]:
    """Export a document to an EPUB written beside it, as `<name>.epub`.

    The document is the whole of the book, so there is nothing to fetch from
    beside it and nothing that can disagree with it. A document missing a
    section simply publishes without that section.
    """
    document = _document(request.path)
    out_path = document.beside(".epub")
    build_epub(document, out_path)
    return {"path": str(out_path)}


class LineSelection(BaseModel):
    # 0-based and inclusive.
    start: int
    end: int


class GrammarFixRequest(BaseModel):
    # Path of the document to correct.
    path: str
    # Where the cursor is.
    line: int
    # The lines the author selected, if they selected any.
    selection: LineSelection | None = None


@app.post("/fix/grammar", status_code=202)
def fix_grammar_endpoint(request: GrammarFixRequest) -> dict[str, Any]:
    """Start correcting a passage; poll /fix/grammar/status for the end of it.

    A pass is over what the author is working on rather than the whole
    document: the lines they selected, or — having selected none — the cell their
    cursor is in. Where a cell ends is the server's to say, so the request
    carries the cursor rather than a span it worked out for itself.
    """
    document = _document(request.path)
    if request.selection:
        start, end = request.selection.start, request.selection.end
    else:
        where = document.lines_at(request.line)
        if where is None:
            raise HTTPException(
                status_code=400, detail="There is no prose there to correct."
            )
        start, end = where
    job = GrammarFixJob(app.state.grammar_model, document, start, end)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/fix/grammar/status")
def fix_grammar_status(id: str) -> dict[str, Any]:
    """Whether the grammar job is still running; the document is its result."""
    job = app.state.jobs.get(id)
    if not isinstance(job, GrammarFixJob):
        raise HTTPException(status_code=404, detail=f"No grammar job for {id}")
    return {"running": not job.done, "error": job.error}


class BlurbRequest(BaseModel):
    # Path of the document to write a blurb for.
    path: str


class BlurbJob(Job):
    kind = "blurb"

    def __init__(self, document: Document) -> None:
        super().__init__(str(document.path))
        self._document = document
        self.blurb = ""

    def execute(self) -> None:
        self.blurb = write_blurb(self._document, lambda: self.cancelled)


@app.post("/generate/blurb", status_code=202)
def generate_blurb(request: BlurbRequest) -> dict[str, Any]:
    """Start writing the story's blurb; poll /generate/blurb/status for it.

    Unlike a grammar pass this does not touch the document — the blurb is handed
    back and the editor puts it in the cell that asked, because a cell's text is
    the editor's to write and a line span is a poor way to name an empty cell.
    """
    job = BlurbJob(_document(request.path))
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/generate/blurb/status")
def generate_blurb_status(id: str) -> dict[str, Any]:
    """Whether the blurb job is still running, and the blurb once it is not."""
    job = app.state.jobs.get(id)
    if not isinstance(job, BlurbJob):
        raise HTTPException(status_code=404, detail=f"No blurb job for {id}")
    return {"running": not job.done, "error": job.error, "blurb": job.blurb}
