"""Backend API."""

import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.publishing.epub_exporter import Report, build_epub, report_of
from server.writing_tools.blurb import write_blurb
from server.writing_tools.check_errors import CheckErrorsJob
from server.story_analysis.plots import StoryPlotsJob
from server.story_analysis.story_plot_classifier import (
    STORY_PLOT_CLASSIFIER_NAME,
    StoryPlotClassifier,
    deploy_story_plot_classifier,
)
from server.writing_tools.recap import volumes_in_reading_order, write_recap
from server.writing_tools import style
from server.models import cluster
import cortexgrid
from cortexgrid_infer import (
    GeminiText2Text,
    Hosted,
    HuggingFaceImporter,
    ServedCompletingModel,
    Text2Text,
    TextRewriter,
)
from server.jobs import Job, ParallelJobsManager
from server import storydoc
from server.storydoc import Document

_log = log.logger(__name__)

GEC_MODEL = "Unbabel/gec-t5_small"
CAUSAL_MODEL = "Qwen/Qwen3-8B"
STYLE_MODEL = "gemini-3.1-pro-preview"

def deploy_inference_models(app: FastAPI) -> None:
    _log.info("Starting the completion models")
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)
    causal_model = HuggingFaceImporter(CAUSAL_MODEL, Text2Text)
    causal_deployment = cluster.deploy(
        causal_model, enable_thinking="false", max_total_tokens="16384"
    )
    app.state.causal_model = causal_model.client(causal_deployment.url)
    gec_model = HuggingFaceImporter(GEC_MODEL, TextRewriter)
    gec_deployment = cluster.deploy(gec_model)
    app.state.gec_model = gec_model.client(gec_deployment.url)
    style_model = Hosted(STYLE_MODEL, GeminiText2Text)
    cortexgrid.register_model(
        style_model.serve_app,
        family=style_model.family,
        suffix=style_model.suffix,
        requirements=style_model.requirements(),
        config=style_model.config(),
    )
    style_deployment = cortexgrid.deploy_model(
        family=style_model.family,
        suffix=style_model.suffix,
        run_name=cortexgrid.IMPORTED,
        timeout=cluster.DEPLOY_TIMEOUT_S,
    )
    app.state.style_model = style_model.client(style_deployment.url)
    story_plot_classifier_deployment = deploy_story_plot_classifier()
    app.state.story_plot_classifier = StoryPlotClassifier.client(
        story_plot_classifier_deployment.url, STORY_PLOT_CLASSIFIER_NAME
    )
    app.state.inference_models = {
        CAUSAL_MODEL: causal_deployment.key,
        GEC_MODEL: gec_deployment.key,
        STYLE_MODEL: style_deployment.key,
        STORY_PLOT_CLASSIFIER_NAME: story_plot_classifier_deployment.key,
    }
    _log.info("Completion models created")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    app.state.inference_models = {}
    app.state.jobs = ParallelJobsManager()
    threading.Thread(target=deploy_inference_models, args=(app,), daemon=True).start()
    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {}


@app.get("/models")
def models() -> dict[str, Any]:
    return {
        "models": [
            {"model": name, "status": cortexgrid.model_serving_status(key).phase}
            for name, key in app.state.inference_models.items()
        ]
    }


def _document(path: str) -> Document:
    target = Path(path)
    if not target.is_file():
        raise HTTPException(status_code=400, detail=f"No such document: {path}")
    return Document.load(target)


def _deployed(model_client_name: str) -> Any:
    model_client = getattr(app.state, model_client_name, None)
    if model_client is None:
        raise HTTPException(
            status_code=503, detail="The models are still being deployed"
        )
    return model_client


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

    def __init__(self, model: ServedCompletingModel, document: Document) -> None:
        super().__init__(storydoc.BLURB, str(document.path))
        self._model = model
        self._document = document

    async def execute(self) -> None:
        self.text = await write_blurb(
            self._model, self._document, lambda: self.cancelled, self.reached
        )


class RecapRequest(BaseModel):
    path: str
    text: str
    documents: list[str]


class RecapJob(WritingJob):
    kind = "recap"

    def __init__(self, model: ServedCompletingModel, document: Document, earlier: list[Document]) -> None:
        super().__init__(storydoc.RECAP, str(document.path))
        self._model = model
        self._earlier = earlier

    async def execute(self) -> None:
        self.text = await write_recap(
            self._model, self._earlier, lambda: self.cancelled, self.reached
        )


@app.post("/generate/blurb", status_code=202)
def generate_blurb(request: BlurbRequest) -> dict[str, Any]:
    """Start writing the story's blurb; poll /generate/status for it."""
    document = Document(request.text, Path(request.path))
    job = BlurbJob(_deployed("causal_model"), document)
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
    job = RecapJob(_deployed("causal_model"), document, earlier)
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

class StyleFixRequest(BaseModel):
    path: str
    text: str


@app.post("/fix/style", status_code=202)
def fix_style_endpoint(request: StyleFixRequest) -> dict[str, Any]:
    document = Document(request.text, Path(request.path))
    job = style.StyleFixJob(_deployed("style_model"), document)
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
        "leftAlone": list(job.left_alone),
        "sections": list(job.sections),
        "progress": {"fixed": job.fixed, "sections": job.to_fix},
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
    job = CheckErrorsJob(_deployed("gec_model"), document, selection)
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


class StoryPlotsRequest(BaseModel):
    path: str
    text: str


@app.post("/analyze/plots", status_code=202)
def identify_story_plots(request: StoryPlotsRequest) -> dict[str, Any]:
    document = Document(request.text, Path(request.path))
    job = StoryPlotsJob(
        _deployed("style_model"), _deployed("story_plot_classifier"), document
    )
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/analyze/plots/status")
def identify_story_plots_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, StoryPlotsJob):
        raise HTTPException(status_code=404, detail=f"No plot identification for {id}")
    return {
        "running": not job.done,
        "cancelled": job.cancelled,
        "error": job.error,
        "storyPlots": job.story_plots,
        "paragraphsInStoryPlots": job.paragraphs_in_story_plots,
        "progress": {
            "passes": job.passes,
            "scored": job.scored,
            "plots": job.to_score,
        },
    }
