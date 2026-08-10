"""Backend API."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

import tenacity
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.epub_exporter import build_epub
from server.grammar import correct_span
from roost import (
    InferenceModelResourceManager,
    ModelNotAvailable,
    CausalModel, EncoderModel, Seq2SeqModel,
    coedit_prompt, machine_memory, qwen_chat_prompt
)
from server.jobs import Job, ParallelJobsManager
from server.line_contribution import line_contribution, write_attribution
from server.manuscript import Manuscript
from server.representations import (
    build_character_representation,
    build_plot_representation,
    build_scene_representation,
)
from server.semantic_search import SearchIndex
from server.story_graph import to_yaml

_log = log.logger(__name__)


CLASSIFIER_MODEL = "Qwen/Qwen3.5-4B"
GRAMMAR_MODEL = "grammarly/coedit-xl"
ENCODER_MODEL = "Qwen/Qwen3-Embedding-0.6B"

# What each model was measured holding over a single batch, and what the models
# are allowed between them. The quota holds both large models and the encoder at
# once: the encoder answers while the cursor moves, and evicting a 5GB model to
# seat 1GB of it would make every section cost a reload.
CLASSIFIER_MODEL_GB = 5.0
GRAMMAR_MODEL_GB = 5.0
ENCODER_MODEL_GB = 1.0
MEMORY_QUOTA_GB = 11.0

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _log.info("Starting the completion models")
    app.state.models = InferenceModelResourceManager(MEMORY_QUOTA_GB)
    app.state.completion_model = CausalModel(
        CLASSIFIER_MODEL, qwen_chat_prompt, app.state.models, CLASSIFIER_MODEL_GB
    )
    app.state.grammar_model = Seq2SeqModel(
        GRAMMAR_MODEL, coedit_prompt, app.state.models, GRAMMAR_MODEL_GB
    )
    app.state.encoder_model = EncoderModel(
        ENCODER_MODEL, app.state.models, ENCODER_MODEL_GB
    )
    app.state.inference_models = [
        app.state.completion_model,
        app.state.grammar_model,
        app.state.encoder_model,
    ]
    app.state.jobs = ParallelJobsManager()
    # The vectors a search reads. They live here rather than beside the
    # manuscripts, and so last exactly as long as this process does.
    app.state.search_index = SearchIndex()
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


def _manuscript(path: str) -> Manuscript:
    document = Path(path)
    if not document.is_file():
        raise HTTPException(status_code=400, detail=f"No such manuscript: {path}")
    return Manuscript.load(document)


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

    def __init__(self, model: CausalModel, manuscript: Manuscript) -> None:
        super().__init__(str(manuscript.graph_path))
        self._model = model
        self._manuscript = manuscript

    def execute(self) -> None:
        graphs = _build_representations(self._model, self._manuscript)
        if not self.cancelled:
            self._manuscript.graph_path.write_text(to_yaml(graphs))


class LineContributionJob(Job):
    kind = "line contribution"

    def __init__(self, model: EncoderModel, manuscript: Manuscript, line: int) -> None:
        # Keyed by the file it writes, like every other job — so scoring a section
        # of a manuscript never supersedes a grammar pass on the manuscript itself.
        super().__init__(str(manuscript.attribution_path))
        self._model = model
        self._manuscript = manuscript
        self._line = line

    def execute(self) -> None:
        contribution = line_contribution(self._model, self._manuscript, self._line)
        if contribution is None:
            raise ValueError(f"no section covers line {self._line}")
        if not self.cancelled:
            write_attribution(Path(self.target), contribution)


class SearchIndexJob(Job):
    kind = "search index"

    def __init__(
        self, index: SearchIndex, model: EncoderModel, manuscript: Manuscript
    ) -> None:
        # Keyed by the manuscript itself. Alone among the jobs this one writes no
        # file, so there is no file to key it by — and a second indexing of a
        # manuscript should supersede the first in any case.
        super().__init__(str(manuscript.path))
        self._index = index
        self._model = model
        self._manuscript = manuscript

    def execute(self) -> None:
        self._index.encode_manuscript(
            self._model, self._manuscript, lambda: self.cancelled
        )


class GrammarFixJob(Job):
    kind = "grammar fix"

    def __init__(
        self, model: Seq2SeqModel, manuscript: Manuscript, start: int, end: int
    ) -> None:
        super().__init__(str(manuscript.path))
        self._model = model
        self._manuscript = manuscript
        self._start = start
        self._end = end

    def execute(self) -> None:
        correct_span(
            self._model,
            self._manuscript,
            self._start,
            self._end,
            lambda: self.cancelled,
        )
        if not self.cancelled:
            self._manuscript.save(self._manuscript.path)



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
    job = RepresentationBuildJob(
        app.state.completion_model, _manuscript(request.path)
    )
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
    manuscript = _manuscript(request.path)

    out_path = manuscript.epub_path
    cover = Path(request.cover) if request.cover else None
    build_epub(
        manuscript,
        out_path,
        cover,
        request.title,
        request.author,
        request.language,
    )
    return {"path": str(out_path)}


class LineContributionRequest(BaseModel):
    # Path of the manuscript.
    path: str
    # 0-based line the cursor is on. The section covering it is the one measured.
    line: int


@app.post("/line_contribution", status_code=202)
def line_contribution_endpoint(request: LineContributionRequest) -> dict[str, Any]:
    """Start scoring the section the cursor is in; the scores land beside the
    manuscript as `<name>.attribution.yaml`.

    A forward pass per line of a section outlives an HTTP request often enough
    that it runs as a job, and the job is followed through /jobs like the rest of
    the work the server has in hand.
    """
    manuscript = _manuscript(request.path)

    job = LineContributionJob(app.state.encoder_model, manuscript, request.line)
    app.state.jobs.start(job)
    return {"id": job.target, "path": job.target}


@app.get("/line_contribution/status")
def line_contribution_status(id: str) -> dict[str, Any]:
    """Whether the scoring job is still running; the file it writes is its result."""
    job = app.state.jobs.get(id)
    if not isinstance(job, LineContributionJob):
        raise HTTPException(status_code=404, detail=f"No scoring job for {id}")
    return {"running": not job.done, "error": job.error}


class SearchIndexRequest(BaseModel):
    # Path of the manuscript to encode.
    path: str


@app.post("/search/index", status_code=202)
def search_index(request: SearchIndexRequest) -> dict[str, Any]:
    """Encode a manuscript's lines, so that searching it is a lookup.

    A forward pass per line runs for as long as the manuscript is long, so this
    runs as a job — and being a job is all it takes to appear in /jobs, which is
    where it is followed. It has no result to collect and no status of its own:
    the vectors are held in memory, and /search says how much of a manuscript it
    has yet to see.
    """
    manuscript = _manuscript(request.path)

    job = SearchIndexJob(app.state.search_index, app.state.encoder_model, manuscript)
    app.state.jobs.start(job)
    return {"id": job.target}


class SearchRequest(BaseModel):
    # Path of the manuscript to search.
    path: str
    # What to look for, in whatever words the author has for it.
    phrase: str
    # Lines to answer with, before adjacent ones are run together into a passage.
    count: int = 10


@app.post("/search")
def search(request: SearchRequest) -> dict[str, Any]:
    """The passages of a manuscript that answer a phrase."""
    manuscript = _manuscript(request.path)

    results = app.state.search_index.search(
        app.state.encoder_model, manuscript, request.phrase, request.count
    )
    return {
        "hits": [
            {
                "start": passage.first_line,
                "end": passage.last_line,
                "score": round(passage.similarity, 4),
                "text": passage.text,
            }
            for passage in results.passages
        ],
        "pending": results.lines_awaiting_encoding,
    }


class LineSelection(BaseModel):
    # 0-based and inclusive.
    start: int
    end: int


class GrammarFixRequest(BaseModel):
    # Path of the manuscript to correct.
    path: str
    # Where the cursor is.
    line: int
    # The lines the author selected, if they selected any.
    selection: LineSelection | None = None


@app.post("/fix/grammar", status_code=202)
def fix_grammar_endpoint(request: GrammarFixRequest) -> dict[str, Any]:
    """Start correcting a passage; poll /fix/grammar/status for the end of it.

    A pass is over what the author is working on rather than the whole
    manuscript: the lines they selected, or — having selected none — the section
    their cursor is in. Where a section ends is the server's to say, so the
    request carries the cursor rather than a span it worked out for itself.
    """
    manuscript = _manuscript(request.path)
    if request.selection:
        start, end = request.selection.start, request.selection.end
    else:
        section = manuscript.section_at(request.line)
        if section is None:
            raise HTTPException(
                status_code=400, detail="There is no prose there to correct."
            )
        start, end = section.start, section.end
    job = GrammarFixJob(app.state.grammar_model, manuscript, start, end)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/fix/grammar/status")
def fix_grammar_status(id: str) -> dict[str, Any]:
    """Whether the grammar job is still running; the manuscript is its result."""
    job = app.state.jobs.get(id)
    if not isinstance(job, GrammarFixJob):
        raise HTTPException(status_code=404, detail=f"No grammar job for {id}")
    return {"running": not job.done, "error": job.error}
