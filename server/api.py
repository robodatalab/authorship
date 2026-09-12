"""Backend API."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.publishing.epub_exporter import Report, build_epub, report_of
from server.writing_tools.blurb import write_blurb
from server.writing_tools.check_errors import CheckErrorsJob
from server.writing_tools.recap import volumes_in_reading_order, write_recap
from server.writing_tools import grammar_check, style
from server.models.gemini import (
    Gemini,
    GeminiError,
    configured_key,
    configured_model,
)
from vramen import (
    CausalModel,
    InferenceModelResourceManager,
    Seq2SeqModel,
    machine_memory, qwen_chat_prompt
)
from server.jobs import Job, ParallelJobsManager
from server import storydoc
from server.storydoc import Document

_log = log.logger(__name__)

GEC_MODEL = "Unbabel/gec-t5_small"
CAUSAL_MODEL = "Qwen/Qwen3-8B"
GEC_MODEL_GB = 1.0
CAUSAL_MODEL_GB = 17.0
MEMORY_QUOTA_GB = 24.0

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _log.info("Starting the completion models")
    app.state.models = InferenceModelResourceManager(MEMORY_QUOTA_GB)
    app.state.causal_model = CausalModel(
        CAUSAL_MODEL, qwen_chat_prompt, app.state.models, CAUSAL_MODEL_GB
    )
    app.state.gec_model = Seq2SeqModel(
        GEC_MODEL, grammar_check.gec_prompt, app.state.models, GEC_MODEL_GB
    )
    app.state.inference_models = [
        app.state.causal_model,
        app.state.gec_model,
    ]
    app.state.jobs = ParallelJobsManager()
    _log.info("Completion models created")

    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    residents = app.state.models.residents
    return {
        "inference_server_status": "unloaded" if not residents else "serving",
    }


@app.get("/models")
def models() -> dict[str, Any]:
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


@app.get("/jobs")
def jobs() -> dict[str, Any]:
    return {
        "jobs": [
            {
                "kind": job.kind,
                "path": job.target,
                "status": job.status,
                "cancelled": job.cancelled,
            }
            for job in app.state.jobs.queued()
        ]
    }


class JobCancelRequest(BaseModel):
    path: str


@app.post("/jobs/cancel")
def cancel_job(request: JobCancelRequest) -> dict[str, Any]:
    job = app.state.jobs.get(request.path)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job for {request.path}")
    job.cancel()
    return {"cancelling": job.target}


class EpubExportRequest(BaseModel):
    path: str
    text: str
    force: bool = False


def _said(found: Report) -> dict[str, Any]:
    return {
        "ready": found.ready,
        "plan": [{"kind": slot.kind, "at": slot.at} for slot in found.plan],
        "added": list(found.added),
        "moved": list(found.moved),
        "wanting": [
            {"kind": item.kind, "needs": list(item.needs)} for item in found.wanting
        ],
    }


@app.post("/export/epub")
def export_epub(request: EpubExportRequest) -> dict[str, Any]:
    document = Document(request.text, Path(request.path))
    found = report_of(document)
    if not (found.ready or request.force):
        return {
        "ready": found.ready,
        "plan": [{"kind": slot.kind, "at": slot.at} for slot in found.plan],
        "added": list(found.added),
        "moved": list(found.moved),
        "wanting": [
            {"kind": item.kind, "needs": list(item.needs)} for item in found.wanting
        ],
        "path": None,
    }
    
    out_path = document.beside(".epub")
    build_epub(document, out_path)
    return {
        "ready": found.ready,
        "plan": [{"kind": slot.kind, "at": slot.at} for slot in found.plan],
        "added": list(found.added),
        "moved": list(found.moved),
        "wanting": [
            {"kind": item.kind, "needs": list(item.needs)} for item in found.wanting
        ],
        "path": str(out_path)
    }


class WritingJob(Job):

    def __init__(self, cell_kind: str, target: str) -> None:
        super().__init__(target)
        self.cell_kind = cell_kind
        self.text = ""
        self.written = 0
        self.chapters = 0

    def reached(self, written: int, chapters: int) -> None:
        self.written, self.chapters = written, chapters


class BlurbRequest(BaseModel):
    # Path of the document to write a blurb for.
    path: str
    text: str


class BlurbJob(WritingJob):
    kind = "blurb"

    def __init__(self, model: CausalModel, document: Document) -> None:
        super().__init__(storydoc.BLURB, str(document.path))
        self._model = model
        self._document = document

    def execute(self) -> None:
        self.text = write_blurb(
            self._model, self._document, lambda: self.cancelled, self.reached
        )


class RecapRequest(BaseModel):
    path: str
    text: str
    documents: list[str]


class RecapJob(WritingJob):
    kind = "recap"

    def __init__(self, model: CausalModel, document: Document, earlier: list[Document]) -> None:
        super().__init__(storydoc.RECAP, str(document.path))
        self._model = model
        self._earlier = earlier

    def execute(self) -> None:
        self.text = write_recap(
            self._model, self._earlier, lambda: self.cancelled, self.reached
        )


@app.post("/generate/blurb", status_code=202)
def generate_blurb(request: BlurbRequest) -> dict[str, Any]:
    """Start writing the story's blurb; poll /generate/status for it."""
    document = Document(request.text, Path(request.path))
    job = BlurbJob(app.state.causal_model, document)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.post("/generate/recap", status_code=202)
def generate_recap(request: RecapRequest) -> dict[str, Any]:
    document = Document(request.text, Path(request.path))
    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="That section names no documents to summarise.",
        )
    earlier = [
        _document(str(volume))
        for volume in volumes_in_reading_order(
            Path(request.path).parent, request.documents
        )
    ]
    job = RecapJob(app.state.causal_model, document, earlier)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/generate/status")
def generate_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, WritingJob):
        raise HTTPException(status_code=404, detail=f"No writing job for {id}")
    return {
        "running": not job.done,
        "error": job.error,
        "kind": job.cell_kind,
        "text": job.text,
        "progress": {"written": job.written, "chapters": job.chapters},
    }

class GeminiKeyRequest(BaseModel):
    key: str
    model: str | None = None


@app.post("/auth/gemini")
def check_gemini(request: GeminiKeyRequest) -> dict[str, Any]:
    """Can the selected Gemini model be reached"""
    try:
        Gemini(request.key, configured_model(request.model)).health_check()
    except GeminiError as err:
        return {"ok": False, "detail": str(err)}
    return {"ok": True, "detail": None}


@app.post("/gemini/models")
def gemini_models(request: GeminiKeyRequest) -> dict[str, Any]:
    """List available Gemin models"""
    key = configured_key(request.key)
    if not key:
        raise HTTPException(status_code=401, detail="Sign in to Gemini first.")
    try:
        found = Gemini(key).models()
    except GeminiError as err:
        raise HTTPException(status_code=502, detail=str(err)) from err
    return {
        "default": configured_model(None),
        "models": [
            {
                "model": str(model.get("name", "")).removeprefix("models/"),
                "label": model.get("displayName") or model.get("name"),
                "detail": model.get("description") or "",
            }
            for model in found
        ]
    }


class StyleFixRequest(BaseModel):
    path: str
    text: str
    key: str | None = None
    model: str | None = None


@app.post("/fix/style", status_code=202)
def fix_style_endpoint(request: StyleFixRequest) -> dict[str, Any]:
    key = configured_key(request.key)
    if not key:
        raise HTTPException(
            status_code=401,
            detail="Sign in to Gemini to correct the style of a manuscript.",
        )
    document = Document(request.text, Path(request.path))
    job = style.StyleFixJob(Gemini(key, configured_model(request.model)), document)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/fix/style/status")
def fix_style_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, style.StyleFixJob):
        raise HTTPException(status_code=404, detail=f"No style pass for {id}")
    return {
        "running": not job.done,
        "cancelled": job.cancelled,
        "error": job.error,
        "unauthorized": job.unauthorized,
        "noQuota": job.no_quota,
        "leftAlone": list(job.left_alone),
        "sections": list(job.sections),
        "progress": {"written": job.fixed, "chapters": job.chapters},
    }


class LineSelection(BaseModel):
    start: int
    end: int


class CheckErrorsRequest(BaseModel):
    path: str
    text: str
    selection: LineSelection | None = None


@app.post("/check/errors", status_code=202)
def check_errors(request: CheckErrorsRequest) -> dict[str, Any]:
    """Start checking a passage; poll /check/errors/status for what it found.

    The whole document when the author turns the checks on, and one paragraph
    when they have just written in it — the same rules over a different span, so
    the second is not a lesser kind of the first and returns findings of exactly
    the same shape.
    """
    document = Document(request.text, Path(request.path))
    selection = (
        (request.selection.start, request.selection.end) if request.selection else None
    )
    job = CheckErrorsJob(app.state.gec_model, document, selection)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/check/errors/status")
def check_errors_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, CheckErrorsJob):
        raise HTTPException(status_code=404, detail=f"No check for {id}")
    return {
        "running": not job.done,
        "cancelled": job.cancelled,
        "error": job.error,
        "findings": job.findings,
    }
