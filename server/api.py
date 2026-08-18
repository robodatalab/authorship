"""Backend API."""

import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Callable

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log
from server.publishing import authorship
from server.publishing.epub_exporter import build_epub
from server.writing_tools.blurb import write_blurb
from server.writing_tools.grammar import correct_span
from vramen import (
    CausalModel,
    InferenceModelResourceManager,
    Seq2SeqModel,
    coedit_prompt, machine_memory, qwen_chat_prompt
)
from server.jobs import Job, ParallelJobsManager
from server.storydoc import Document

_log = log.logger(__name__)


GRAMMAR_MODEL = "grammarly/coedit-xl"

# Everything that is asked in words rather than trained for goes to this one:
# blurbs now, and whatever else is written by instruction later. At 8B in bf16 it
# leaves half the budget for the prompt, which is what a tool feeding it a whole
# chapter needs; a larger model would buy prose and lose the room to read.
CAUSAL_MODEL = "Qwen/Qwen3-8B"

# What the model was measured holding over a single batch, and what it is allowed.
GRAMMAR_MODEL_GB = 5.0
CAUSAL_MODEL_GB = 17.0
MEMORY_QUOTA_GB = 24.0

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _log.info("Starting the completion models")
    app.state.models = InferenceModelResourceManager(MEMORY_QUOTA_GB)
    app.state.grammar_model = Seq2SeqModel(
        GRAMMAR_MODEL, coedit_prompt, app.state.models, GRAMMAR_MODEL_GB
    )
    app.state.causal_model = CausalModel(
        CAUSAL_MODEL, qwen_chat_prompt, app.state.models, CAUSAL_MODEL_GB
    )
    app.state.inference_models = [app.state.grammar_model, app.state.causal_model]
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
    """The work in hand: every unfinished job, the file it is queued on, and
    whether it has been told to stop.

    A job stops between the pieces of work it is made of, so being told and
    being finished are minutes apart on a long one. Both are reported, because
    a stop button whose row still says `running` reads as a button that failed.
    """
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
    # Path of the document whose job is to stop — a job is keyed by what it writes.
    path: str


@app.post("/jobs/cancel")
def cancel_job(request: JobCancelRequest) -> dict[str, Any]:
    """Ask the job on a document to stop.

    Asked rather than killed: a job stops between pieces of work, where it has
    left nothing half-done. So this answers that it was asked, and the job's own
    status endpoint is what says when it has.
    """
    job = app.state.jobs.get(request.path)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job for {request.path}")
    job.cancel()
    return {"cancelling": job.target}


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

    def __init__(self, model: CausalModel, document: Document) -> None:
        super().__init__(str(document.path))
        self._model = model
        self._document = document
        self.blurb = ""
        # A chapter at a time is the only division the work has, so it is the
        # only one the author can be shown. Read from the thread answering the
        # status endpoint while the worker writes them, which two ints tolerate.
        self.written = 0
        self.chapters = 0

    def execute(self) -> None:
        self.blurb = write_blurb(
            self._model, self._document, lambda: self.cancelled, self._reached
        )

    def _reached(self, written: int, chapters: int) -> None:
        self.written, self.chapters = written, chapters


@app.post("/generate/blurb", status_code=202)
def generate_blurb(request: BlurbRequest) -> dict[str, Any]:
    """Start writing the story's blurb; poll /generate/blurb/status for it.

    Unlike a grammar pass this does not touch the document — the blurb is handed
    back and the editor puts it in the cell that asked, because a cell's text is
    the editor's to write and a line span is a poor way to name an empty cell.
    """
    document = _document(request.path)
    job = BlurbJob(app.state.causal_model, document)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/generate/blurb/status")
def generate_blurb_status(id: str) -> dict[str, Any]:
    """Whether the blurb job is still running, how far it has read, and the blurb
    once it is not.

    A book is read chapter by chapter, so how far it has got is a real fraction
    rather than a guess — `chapters` is 0 only in the moment before the document
    has been read, when there is nothing yet to be a fraction of.
    """
    job = app.state.jobs.get(id)
    if not isinstance(job, BlurbJob):
        raise HTTPException(status_code=404, detail=f"No blurb job for {id}")
    return {
        "running": not job.done,
        "error": job.error,
        "blurb": job.blurb,
        "progress": {"written": job.written, "chapters": job.chapters},
    }


# --- checking the prose ---------------------------------------------------
#
# Mocked, and written to be thrown away. What the editor has to be built
# against is a check that takes a while to answer, hands back spans it can
# underline, and supersedes itself when the author types over one — none of
# which needs a model to be true. The rules below are stand-ins, picked for
# firing on any manuscript and for firing in the same place twice.


# How far apart two sayings of the same word are still a repetition. Lines
# rather than sentences, because lines are what the server works in.
_NEARBY_LINES = 6

# What a model would take, so that the editor is built against a wait it will
# actually have to draw.
_SECONDS_PER_LINE = 0.02
_SECONDS_AT_MOST = 2.0
_SLICE_SECONDS = 0.05

_WORD = re.compile(r"[A-Za-z][A-Za-z'’]*")

_SLIPS = {
    "teh": "the",
    "recieve": "receive",
    "occured": "occurred",
    "seperate": "separate",
    "definately": "definitely",
    "acheive": "achieve",
}

# Said twice on purpose often enough that flagging them is worse than missing
# them.
_DOUBLES_ALLOWED = frozenset({"had", "that", "no"})

# Long enough to be a content word by length alone, common enough that saying
# them twice is not a repetition anyone would hear.
_COMMON = frozenset(
    {
        "about", "after", "again", "against", "because", "before", "being",
        "between", "could", "every", "first", "found", "might", "never",
        "other", "should", "still", "their", "there", "these", "thing",
        "think", "those", "through", "under", "where", "which", "while",
        "would",
    }
)


class ProseCheckRequest(BaseModel):
    # Path of the document to check. What it is called rather than where to read
    # it — the text comes with the request — since a job is keyed by the document
    # it is about.
    path: str
    # The document as the author has it. A check only reads, so unlike every
    # other job here it has no need of the file: asked for the text, it can
    # report on a paragraph that has not been saved and never asks the editor to
    # save one on its behalf.
    text: str | None = None
    # The lines to check. Omitted, the whole document is checked — which is what
    # turning the checks on asks for; a passage is what the paragraph under an
    # edit asks for.
    selection: LineSelection | None = None


def _check_target(path: Path, selection: tuple[int, int] | None) -> str:
    """What a check contends with, which is the passage rather than the file.

    Every other job here writes the document, so the file is the thing two of
    them cannot both hold and the newer one rightly cancels the older. A check
    writes nothing — it reports — and there is no reason two passages cannot be
    read at once. Keyed by the file, re-checking one paragraph would cancel the
    pass over the rest of the book, and marks the author never touched would go
    out from under them.
    """
    where = "all" if selection is None else f"{selection[0]}-{selection[1]}"
    return f"{path}#{where}"


class ProseCheckJob(Job):
    """A pass over a passage that says what is wrong with it and changes none of
    it. Nothing is written and nothing is saved, so the result is the report."""

    kind = "prose check"

    def __init__(self, document: Document, selection: tuple[int, int] | None) -> None:
        assert document.path is not None
        super().__init__(_check_target(document.path, selection))
        self._document = document
        self._selection = selection
        self.findings: list[dict[str, Any]] = []

    def execute(self) -> None:
        start, end = self._selection or (0, len(self._document.lines) - 1)
        # `story_lines` hands back the line stripped; a mark has to be placed on
        # the line as it is written, so only the number is taken from it.
        prose = [
            (index, self._document.lines[index])
            for index, _ in self._document.story_lines(start, end)
        ]
        if not _waited(len(prose), lambda: self.cancelled):
            return
        self.findings = _slips_in(prose) + _repetitions_in(prose)


def _waited(lines: int, cancelled: Callable[[], bool]) -> bool:
    """Take as long as a model might, and say whether it is still worth going on.

    In slices, so that a check the author has typed over stops where a real one
    would — between pieces of work — rather than reporting on a paragraph that
    has since changed.
    """
    total = min(lines * _SECONDS_PER_LINE, _SECONDS_AT_MOST)
    waited = 0.0
    while waited < total:
        if cancelled():
            return False
        time.sleep(_SLICE_SECONDS)
        waited += _SLICE_SECONDS
    return not cancelled()


def _slips_in(prose: list[tuple[int, str]]) -> list[dict[str, Any]]:
    """Misspellings and doubled words, standing in for the grammar model."""
    found: list[dict[str, Any]] = []
    for index, line in prose:
        words = list(_WORD.finditer(line))
        for place, word in enumerate(words):
            said = word.group().lower()

            correction = _SLIPS.get(said)
            if correction:
                found.append(
                    _finding(
                        "grammar",
                        index,
                        word.start(),
                        word.end(),
                        f"“{word.group()}” is misspelt",
                        f"“{word.group()}” is not a word. The spelling is "
                        f"“{correction}”.",
                    )
                )

            before = words[place - 1] if place else None
            if (
                before is not None
                and before.group().lower() == said
                and said not in _DOUBLES_ALLOWED
            ):
                found.append(
                    _finding(
                        "grammar",
                        index,
                        before.start(),
                        word.end(),
                        f"“{said}” is written twice",
                        f"The word “{said}” appears twice in a row. Usually one "
                        "of the two is a copy left behind by an edit.",
                    )
                )
    return found


def _repetitions_in(prose: list[tuple[int, str]]) -> list[dict[str, Any]]:
    """A content word said twice close together, standing in for the style model.

    One finding carrying both places rather than two findings, because a
    repetition is a pair and an underline under one half of it says nothing. It
    is also why a check of a single paragraph cannot settle a repetition on its
    own: the other half is in a paragraph it was not asked to read.
    """
    seen: dict[str, tuple[int, int, int]] = {}
    found: list[dict[str, Any]] = []
    for index, line in prose:
        for word in _WORD.finditer(line):
            said = word.group().lower()
            if len(said) < 5 or said in _COMMON:
                continue
            before = seen.get(said)
            if before is not None and index - before[0] <= _NEARBY_LINES:
                found.append(
                    _finding(
                        "repetition",
                        index,
                        word.start(),
                        word.end(),
                        f"“{word.group()}” again",
                        f"“{word.group()}” was used a moment ago and is used "
                        "again here. A word repeated inside a few lines is "
                        "heard as an echo rather than as emphasis, unless the "
                        "echo is the point.",
                        related=[_span(before[0], before[1], before[2])],
                    )
                )
            seen[said] = (index, word.start(), word.end())
    return found


def _span(line: int, at: int, end: int) -> dict[str, Any]:
    return {"at": {"line": line, "character": at}, "end": {"line": line, "character": end}}


def _finding(
    rule: str,
    line: int,
    at: int,
    end: int,
    message: str,
    detail: str,
    related: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """One thing wrong, and everywhere it is wrong.

    `message` is what fits under the underline and `detail` is what the author
    reads when they stop on it; a mark that can only afford one of the two ends
    up saying neither well. `related` is the rest of the same fault — empty for
    a fault that is in one place, which most are.
    """
    return {
        "rule": rule,
        "message": message,
        "detail": detail,
        **_span(line, at, end),
        "related": related or [],
    }


@app.post("/check/prose", status_code=202)
def check_prose(request: ProseCheckRequest) -> dict[str, Any]:
    """Start checking a passage; poll /check/prose/status for what it found.

    The whole document when the author turns the checks on, and one paragraph
    when they have just written in it — the same pass over a different span, so
    the second is not a lesser kind of the first and returns findings of exactly
    the same shape.
    """
    document = (
        Document(request.text, Path(request.path))
        if request.text is not None
        else _document(request.path)
    )
    selection = (
        (request.selection.start, request.selection.end) if request.selection else None
    )
    job = ProseCheckJob(document, selection)
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/check/prose/status")
def check_prose_status(id: str) -> dict[str, Any]:
    """Whether the check is still running, and what it found once it is not.

    Empty findings on a job still running are not "nothing wrong" — the editor
    has to keep the marks it already has until `running` goes false, or the
    prose flickers clean every time the author touches it. Nor are they on one
    that was cancelled, which is a check the author typed over: the pass that
    superseded it is the one worth drawing.
    """
    job = app.state.jobs.get(id)
    if not isinstance(job, ProseCheckJob):
        raise HTTPException(status_code=404, detail=f"No prose check for {id}")
    return {
        "running": not job.done,
        "cancelled": job.cancelled,
        "error": job.error,
        "findings": job.findings,
    }
