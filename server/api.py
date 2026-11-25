"""Backend API."""

import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import cortexgrid
import cortexgrid_infer
from authordoc import cells, storydoc
from server import jobs, log, models, publishing, story_generator, writing_tools

_log = log.logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    app.state.inference_models = {}
    app.state.jobs = jobs.ParallelJobsManager()
    threading.Thread(target=models.deploy_inference_models, args=(app,), daemon=True).start()
    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {}


@app.get("/models")
def get_models() -> dict[str, Any]:
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
def get_jobs() -> dict[str, Any]:
    in_flight = app.state.jobs.in_flight()
    return {"jobs": in_flight}


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


@app.post("/export/epub")
def export_epub(request: EpubExportRequest) -> dict[str, Any]:
    document = storydoc.Document(request.text, Path(request.path))
    found = publishing.tools.can_convert_to_epub(document)
    if not (found.ready_to_export or request.force):
        return {
        "ready_to_export": found.ready_to_export,
        "missing_cells": found.missing_cells,
        "missing_cell_content": [
            {"kind": item.kind, "needs": item.needs} for item in found.missing_cell_content
        ],
        "path": None,
    }
    
    assert document.path is not None
    out_path = document.path.with_suffix(".epub")
    publishing.build_epub(document, out_path)
    return {
        "ready_to_export": found.ready_to_export,
        "missing_cells": found.missing_cells,
        "missing_cell_content": [
            {"kind": item.kind, "needs": item.needs} for item in found.missing_cell_content
        ],
        "path": str(out_path)
    }


class WritingJob(jobs.Job):

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

    def __init__(self, deployment: cortexgrid.Deployment[cortexgrid_infer.CompletingModel], path: Path, story: str) -> None:
        super().__init__(cells.BLURB, str(path))
        self._deployment = deployment
        self._path = path
        self._story = story

    async def execute(self) -> None:
        model = self._deployment.client_async()
        document = storydoc.Document(self._story, self._path)
        self.text = await writing_tools.write_blurb(
            model, document, progress=self.reached
        )


class RecapRequest(BaseModel):
    path: str
    text: str
    documents: list[str]


class RecapJob(WritingJob):
    kind = "recap"

    def __init__(self, deployment: cortexgrid.Deployment[cortexgrid_infer.CompletingModel], path: Path, earlier: list[Path]) -> None:
        super().__init__(cells.RECAP, str(path))
        self._deployment = deployment
        self._earlier = earlier

    async def execute(self) -> None:
        model = self._deployment.client_async()
        earlier = [storydoc.Document.load(volume) for volume in self._earlier]
        self.text = await writing_tools.write_recap(
            model, earlier, progress=self.reached
        )


@jobs.job_endpoint(app, post="/generate/blurb", get="/generate/blurb/status")
def generate_blurb(request: BlurbRequest) -> BlurbJob:
    """Start writing the story's blurb; poll /generate/blurb/status for it."""
    job = BlurbJob(_deployed("causal_deployment"), Path(request.path), request.text)
    return job


@jobs.job_endpoint(app, post="/generate/recap", get="/generate/recap/status")
def generate_recap(request: RecapRequest) -> RecapJob:
    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="That section names no documents to summarise.",
        )
    earlier = writing_tools.volumes_in_reading_order(Path(request.path).parent, request.documents)
    for volume in earlier:
        if not volume.is_file():
            raise HTTPException(status_code=400, detail=f"No such document: {volume}")
    job = RecapJob(_deployed("causal_deployment"), Path(request.path), earlier)
    return job


class StoryGenerationRequest(BaseModel):
    # Path of the .author file to generate the story into.
    path: str
    story: str
    stage: str


@jobs.job_endpoint(app, post="/generate/story", get="/generate/story/status")
def generate_story(request: StoryGenerationRequest) -> story_generator.StoryGenerationJob:
    """Run a stage of generating the story with its author; poll
    /generate/story/status for the story it generates."""
    make_the_stage = story_generator.STAGES_BY_NAME.get(request.stage)
    if make_the_stage is None:
        raise HTTPException(status_code=400, detail=f"No stage {request.stage}")
    deployment = _deployed("writing_deployment")
    stage = make_the_stage(deployment)
    job = story_generator.StoryGenerationJob(request.stage, stage, Path(request.path), request.story)
    return job


class StyleFixRequest(BaseModel):
    path: str
    text: str


@jobs.job_endpoint(app, post="/fix/style", get="/fix/style/status")
def fix_style_endpoint(request: StyleFixRequest) -> writing_tools.StyleFixJob:
    job = writing_tools.StyleFixJob(_deployed("style_deployment"), Path(request.path), request.text)
    return job


class LineSelection(BaseModel):
    start: int
    end: int


class CheckErrorsRequest(BaseModel):
    path: str
    text: str
    selection: LineSelection | None = None


@jobs.job_endpoint(app, post="/check/errors", get="/check/errors/status")
def check_errors(request: CheckErrorsRequest) -> writing_tools.CheckErrorsJob:
    """Start checking a passage; poll /check/errors/status for what it found.

    The whole document when the author turns the checks on, and one paragraph
    when they have just written in it — the same rules over a different span, so
    the second is not a lesser kind of the first and returns findings of exactly
    the same shape.
    """
    selection = (
        (request.selection.start, request.selection.end) if request.selection else None
    )
    job = writing_tools.CheckErrorsJob(_deployed("gec_deployment"), Path(request.path), request.text, selection)
    return job
