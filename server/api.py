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
from server.writing_tools.recap import volumes_in_reading_order, write_recap
from server.writing_tools import style
from server.story_generator.job import StoryGenerationJob
from server.story_generator.stages import STAGES_BY_NAME
from server.models.inference_models import deploy_inference_models
import cortexgrid
from cortexgrid_infer import CompletingModel
from server.jobs import Job, ParallelJobsManager
from authordoc.storydoc import Document
from authordoc.cells.blurb_cell import BLURB
from authordoc.cells.recap_cell import RECAP

_log = log.logger(__name__)

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
            for name, key in list(app.state.inference_models.items())
        ]
    }


def _deployed(deployment_name: str) -> Any:
    deployment = getattr(app.state, deployment_name, None)
    if deployment is None:
        raise HTTPException(
            status_code=503, detail="The models are still being deployed"
        )
    return deployment


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
    app.state.jobs.cancel(request.path)
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
    
    assert document.path is not None
    out_path = document.path.with_suffix(".epub")
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

    def snapshot(self) -> dict[str, Any]:
        return {
            "kind": self.cell_kind,
            "text": self.text,
            "progress": {"written": self.written, "chapters": self.chapters},
        }


class BlurbRequest(BaseModel):
    # Path of the document to write a blurb for.
    path: str
    text: str


class BlurbJob(WritingJob):
    kind = "blurb"

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel], path: Path, story: str) -> None:
        super().__init__(BLURB, str(path))
        self._deployment = deployment
        self._path = path
        self._story = story

    async def execute(self) -> None:
        model = self._deployment.client_async()
        document = Document(self._story, self._path)
        self.text = await write_blurb(
            model, document, lambda: self.cancelled, self.reached
        )


class RecapRequest(BaseModel):
    path: str
    text: str
    documents: list[str]


class RecapJob(WritingJob):
    kind = "recap"

    def __init__(self, deployment: cortexgrid.Deployment[CompletingModel], path: Path, earlier: list[Path]) -> None:
        super().__init__(RECAP, str(path))
        self._deployment = deployment
        self._earlier = earlier

    async def execute(self) -> None:
        model = self._deployment.client_async()
        earlier = [Document.load(volume) for volume in self._earlier]
        self.text = await write_recap(
            model, earlier, lambda: self.cancelled, self.reached
        )


@app.post("/generate/blurb", status_code=202)
def generate_blurb(request: BlurbRequest) -> dict[str, Any]:
    """Start writing the story's blurb; poll /generate/status for it."""
    job = BlurbJob(_deployed("causal_deployment"), Path(request.path), request.text)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.post("/generate/recap", status_code=202)
def generate_recap(request: RecapRequest) -> dict[str, Any]:
    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="That section names no documents to summarise.",
        )
    earlier = volumes_in_reading_order(Path(request.path).parent, request.documents)
    for volume in earlier:
        if not volume.is_file():
            raise HTTPException(status_code=400, detail=f"No such document: {volume}")
    job = RecapJob(_deployed("causal_deployment"), Path(request.path), earlier)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/generate/status")
def generate_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, WritingJob):
        raise HTTPException(status_code=404, detail=f"No writing job for {id}")
    status = app.state.jobs.reported(id)
    return status


class StoryGenerationRequest(BaseModel):
    # Path of the .author file to generate the story into.
    path: str
    story: str
    stage: str


@app.post("/generate/story", status_code=202)
def generate_story(request: StoryGenerationRequest) -> dict[str, Any]:
    """Run a stage of generating the story with its author; poll
    /generate/story/status for what it asks them."""
    make_the_stage = STAGES_BY_NAME.get(request.stage)
    if make_the_stage is None:
        raise HTTPException(status_code=400, detail=f"No stage {request.stage}")
    deployment = _deployed("writing_deployment")
    stage = make_the_stage(deployment)
    job = StoryGenerationJob(request.stage, stage, Path(request.path), request.story)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/generate/story/status")
def generate_story_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, StoryGenerationJob):
        raise HTTPException(status_code=404, detail=f"No story generation for {id}")
    status = app.state.jobs.reported(id)
    return status


class StyleFixRequest(BaseModel):
    path: str
    text: str


@app.post("/fix/style", status_code=202)
def fix_style_endpoint(request: StyleFixRequest) -> dict[str, Any]:
    job = style.StyleFixJob(_deployed("style_deployment"), Path(request.path), request.text)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/fix/style/status")
def fix_style_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, style.StyleFixJob):
        raise HTTPException(status_code=404, detail=f"No style pass for {id}")
    status = app.state.jobs.reported(id)
    return status


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
    selection = (
        (request.selection.start, request.selection.end) if request.selection else None
    )
    job = CheckErrorsJob(_deployed("gec_deployment"), Path(request.path), request.text, selection)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/check/errors/status")
def check_errors_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, CheckErrorsJob):
        raise HTTPException(status_code=404, detail=f"No check for {id}")
    status = app.state.jobs.reported(id)
    return status
