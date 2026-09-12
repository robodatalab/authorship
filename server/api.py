"""Backend API."""

import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.publishing import authorship
from server.publishing.epub_exporter import Report, build_epub, report_of
from server.writing_tools.blurb import write_blurb
from server.writing_tools.recap import write_recap
from server.writing_tools import grammar_check, prose_check, style
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
    """A report as the editor reads it."""
    return {
        "ready": found.ready,
        "plan": [{"kind": slot.kind, "at": slot.at} for slot in found.plan],
        "added": list(found.added),
        "moved": list(found.moved),
        "wanting": [
            {"kind": item.kind, "needs": list(item.needs)} for item in found.wanting
        ],
    }


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
    document = Document(request.text, Path(request.path))
    found = report_of(document)
    if not (found.ready or request.force):
        return _said(found)
    out_path = document.beside(".epub")
    build_epub(document, out_path)
    return {**_said(found), "path": str(out_path)}


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
    # Path of the document the recap is being written into.
    path: str
    text: str
    # The earlier documents to summarise, named relative to that one. Resolved
    # and ordered here rather than by the editor: which file a relative path
    # means is a question about the disk, and the order they are read in is a
    # question about the story.
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
    """Start writing the story so far; poll /generate/status for it.

    The earlier volumes are read in the alphabetical order of the paths that name
    them, which is the order `part_1.author`, `part_2.author` and their like
    already stand in — so an author who names them in whatever order they think
    of gets the story in the order it happened. A path named twice is one
    document, and is read once.
    """
    document = Document(request.text, Path(request.path))
    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="That section names no documents to summarise.",
        )
    beside = Path(request.path).parent
    earlier = [
        _document(str(beside / named))
        for named in sorted(set(request.documents), key=_in_order)
    ]
    job = RecapJob(app.state.causal_model, document, earlier)
    app.state.jobs.start(job)
    return {"id": job.target}


_DIGITS = re.compile(r"(\d+)")


def _in_order(named: str) -> list[Any]:
    """A path as it sorts, with runs of digits compared as the numbers they are.

    Alphabetically `part_10.author` stands between `part_1` and `part_2`, which
    would hand the tenth volume to the model before the second and quietly
    produce a summary of a story nobody wrote. A tenth part is exactly what a
    serial long enough to need this has, so the order has to survive it.

    The split alternates text and digits from the same starting foot for every
    path, so two paths only ever compare text against text and number against
    number.
    """
    return [
        int(piece) if index % 2 else piece
        for index, piece in enumerate(_DIGITS.split(named))
    ]


@app.get("/generate/status")
def generate_status(id: str) -> dict[str, Any]:
    """Which section is being written for a document, how far it has read, and
    what it wrote once it has stopped.

    A book is read chapter by chapter, so how far it has got is a real fraction
    rather than a guess — `chapters` is 0 only in the moment before the documents
    have been read, when there is nothing yet to be a fraction of.
    """
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


# --- correcting the whole manuscript ---------------------------------------
#
# The one thing here that does not run on this machine. Style is a property of a
# chapter rather than of a sentence, and a pass that reads the corrected book so
# far needs a context length no model that fits beside the others has — so this
# one goes to the author's own Gemini account, with the author's own key.
#
# The key arrives with the request. The editor holds it in the VS Code secret
# store, which is the right place for it: this server is a local process with no
# store of its own, and a key written into a config file beside the manuscript
# is a key that ends up in the author's git history.


class GeminiKeyRequest(BaseModel):
    # The key to try. Never stored here — this only says whether it opens the API.
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
        # What a request that names no model would reach, so the editor's "use
        # the one Authorship ships with" can say which one that is.
        "default": configured_model(None),
        "models": [
            {
                # `models/gemini-3.1-pro` is what the API answers to, and the
                # bare name is what a setting holds.
                "model": str(model.get("name", "")).removeprefix("models/"),
                "label": model.get("displayName") or model.get("name"),
                "detail": model.get("description") or "",
            }
            for model in found
        ]
    }


class StyleFixRequest(BaseModel):
    # Path of the document to correct.
    path: str
    text: str
    # The author's Gemini key. Omitted, the environment is asked — which is how a
    # server somebody started themselves is given one.
    key: str | None = None
    # Which Gemini to use, for an author who would rather pay for a different one.
    model: str | None = None


class StyleFixJob(Job):
    """Fix the style of writing in the document using Gemini"""

    kind = "style fix"

    def __init__(self, key: str, model: str, document: Document) -> None:
        super().__init__(str(document.path))
        self._model = Gemini(key, model)
        self._document = document
        self.sections: list[dict[str, Any]] = []
        self.fixed = 0
        self.chapters = 0
        self.unauthorized = False
        self.no_quota = False
        self.left_alone: list[dict[str, str]] = []

    def execute(self) -> None:
        try:
            style.fix_style(
                self._model,
                self._document,
                lambda: self.cancelled,
                self._reached,
                self._revised,
                self._left_alone,
            )
        except GeminiError as err:
            self.unauthorized = err.unauthorized
            self.no_quota = err.no_quota
            raise

    def _reached(self, fixed: int, chapters: int) -> None:
        self.fixed, self.chapters = fixed, chapters

    def _revised(self, cell_id: str, source: str) -> None:
        self.sections.append({"cellId": cell_id, "source": source})

    def _left_alone(self, title: str, why: str) -> None:
        self.left_alone.append({"chapter": title, "why": why})


@app.post("/fix/style", status_code=202)
def fix_style_endpoint(request: StyleFixRequest) -> dict[str, Any]:
    key = configured_key(request.key)
    if not key:
        raise HTTPException(
            status_code=401,
            detail="Sign in to Gemini to correct the style of a manuscript.",
        )
    document = Document(request.text, Path(request.path))
    job = StyleFixJob(key, configured_model(request.model), document)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/fix/style/status")
def fix_style_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, StyleFixJob):
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


class ProseCheckRequest(BaseModel):
    path: str
    text: str
    selection: LineSelection | None = None


def _check_target(path: Path, selection: tuple[int, int] | None) -> str:
    where = "all" if selection is None else f"{selection[0]}-{selection[1]}"
    return f"{path}#{where}"


def _story_lines(document: Document, start: int, end: int) -> list[tuple[int, str]]:
    return [
        (index, document.lines[index])
        for index, _ in document.story_lines(start, end)
    ]


class ProseCheckJob(Job):
    """The rules that need no model: the story's own faults, and usage.

    Kept apart from the grammar pass because it is a hundred times faster, and a
    report that waits for the slowest thing in it is a report nobody sees. This
    one answers while the author is still looking at the paragraph.
    """

    kind = "prose check"

    def __init__(self, document: Document, selection: tuple[int, int] | None) -> None:
        assert document.path is not None
        super().__init__(_check_target(document.path, selection))
        self._document = document
        self._selection = selection
        self.findings: list[dict[str, Any]] = []

    def execute(self) -> None:
        start, end = self._selection or (0, len(self._document.lines) - 1)
        crutches = (
            prose_check.crutch_lemmas(
                _story_lines(self._document, 0, len(self._document.lines) - 1)
            )
            if self._selection is None
            else frozenset()
        )
        if self.cancelled:
            return
        self.findings = [
            error
            for finding in prose_check.check(
                _story_lines(self._document, start, end), crutches
            )
            for error in _prose_check_errors(self._document, finding)
        ]


class GrammarCheckJob(Job):
    """The grammar pass, which is a model and is therefore slow.

    Its own job so that it is its own wait. The names it must not touch are read
    off the whole document; a paragraph is in no position to work out what the
    people in the book are called.
    """

    kind = "grammar check"

    def __init__(
        self,
        model: Seq2SeqModel,
        document: Document,
        selection: tuple[int, int] | None,
    ) -> None:
        assert document.path is not None
        super().__init__(f"{_check_target(document.path, selection)}#gec")
        self._model = model
        self._document = document
        self._selection = selection
        self.findings: list[dict[str, Any]] = []

    def execute(self) -> None:
        start, end = self._selection or (0, len(self._document.lines) - 1)
        self.findings = [
            error
            for finding in grammar_check.check(
                self._model,
                _story_lines(self._document, start, end),
                grammar_check.names_in(self._document.text),
            )
            for error in _prose_check_errors(self._document, finding)
        ]


def _prose_check_errors(
    document: Document, finding: prose_check.Finding
) -> list[dict[str, Any]]:
    errors = []
    for at, end in [(finding.at, finding.end), *finding.related]:
        cell = document.cell_at(at.line)
        if cell is None or cell is not document.cell_at(end.line):
            continue
        errors.append(
            {
                "cellId": cell.unique_id,
                "startCharacterOffsetInCell": cell.offset_of(at.line, at.character),
                "endCharacterOffsetInCell": cell.offset_of(end.line, end.character),
                "wordsInTheCell": cell.source[
                    cell.offset_of(at.line, at.character) : cell.offset_of(
                        end.line, end.character
                    )
                ],
                "isVisible": True,
                "ruleThatFoundTheError": finding.rule,
                "isAnErrorOf": "style" if finding.kind == "style" else "grammar",
                "reasonForError": finding.detail,
                "correctVersion": finding.replacements[0]
                if finding.replacements
                else "",
            }
        )
    return errors


@app.post("/check/prose", status_code=202)
def check_prose(request: ProseCheckRequest) -> dict[str, Any]:
    """Start checking a passage; poll /check/prose/status for what it found.

    The whole document when the author turns the checks on, and one paragraph
    when they have just written in it — the same rules over a different span, so
    the second is not a lesser kind of the first and returns findings of exactly
    the same shape.
    """
    document = Document(request.text, Path(request.path))
    selection = (
        (request.selection.start, request.selection.end) if request.selection else None
    )
    job = ProseCheckJob(document, selection)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/check/prose/status")
def check_prose_status(id: str) -> dict[str, Any]:
    job = app.state.jobs.get(id)
    if not isinstance(job, ProseCheckJob):
        raise HTTPException(status_code=404, detail=f"No prose check for {id}")
    return {
        "running": not job.done,
        "cancelled": job.cancelled,
        "error": job.error,
        "findings": job.findings,
    }


@app.post("/check/grammar", status_code=202)
def check_grammar(request: ProseCheckRequest) -> dict[str, Any]:
    document = Document(request.text, Path(request.path))
    selection = (
        (request.selection.start, request.selection.end) if request.selection else None
    )
    job = GrammarCheckJob(app.state.gec_model, document, selection)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/check/grammar/status")
def check_grammar_status(id: str) -> dict[str, Any]:
    """Whether the grammar pass is still reading, and what it found once it is not."""
    job = app.state.jobs.get(id)
    if not isinstance(job, GrammarCheckJob):
        raise HTTPException(status_code=404, detail=f"No grammar check for {id}")
    return {
        "running": not job.done,
        "cancelled": job.cancelled,
        "error": job.error,
        "findings": job.findings,
    }
