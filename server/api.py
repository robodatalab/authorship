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
from server.writing_tools import grammar_check, prose_check
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

# Grammar as a check rather than as a rewrite. A minimal-edit corrector: trained
# to change as little as will make a sentence grammatical, which is the only kind
# of model that can be pointed at a novel without arguing with it. Small enough
# to sit beside the others rather than take a turn with them.
GEC_MODEL = "Unbabel/gec-t5_small"

# Everything that is asked in words rather than trained for goes to this one:
# blurbs now, and whatever else is written by instruction later. At 8B in bf16 it
# leaves half the budget for the prompt, which is what a tool feeding it a whole
# chapter needs; a larger model would buy prose and lose the room to read.
CAUSAL_MODEL = "Qwen/Qwen3-8B"

# What the model was measured holding over a single batch, and what it is allowed.
GRAMMAR_MODEL_GB = 5.0
GEC_MODEL_GB = 1.0
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
    app.state.gec_model = Seq2SeqModel(
        GEC_MODEL, grammar_check.gec_prompt, app.state.models, GEC_MODEL_GB
    )
    app.state.inference_models = [
        app.state.grammar_model,
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


# --- checking the prose ----------------------------------------------------
#
# The rules live in `server/writing_tools/prose_check.py`. What is here is the
# job that runs them and the two endpoints it is driven by.
#
# A check writes nothing — it reports — which is what makes it unlike every other
# job in this file, and is why its target is the passage rather than the
# document: two passages can be read at once, and a paragraph re-read after an
# edit must not cancel the pass over the rest of the book.


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
    writes nothing, and there is no reason two passages cannot be read at once.
    Keyed by the file, re-checking one paragraph would cancel the pass over the
    rest of the book, and marks the author never touched would go out from under
    them.
    """
    where = "all" if selection is None else f"{selection[0]}-{selection[1]}"
    return f"{path}#{where}"


def _story_lines(document: Document, start: int, end: int) -> list[tuple[int, str]]:
    """The story's own lines, by their number in the file.

    `story_lines` hands back the line stripped; a mark has to be placed on the
    line as it is written, so only the number is taken from it.
    """
    return [
        (index, document.lines[index])
        for index, _ in document.story_lines(start, end)
    ]


# What a document says about itself: the words it leans on, and the names it has
# invented. Both are properties of the book rather than of the paragraph being
# read, and both cost a parse of the whole thing — so they are worked out by the
# pass over the whole document and read by every pass after it. A paragraph
# re-read on a pause in typing must not re-read the novel to do it.
_ABOUT: dict[str, tuple[frozenset[str], list[str]]] = {}


def _learn(document: Document) -> tuple[frozenset[str], list[str]]:
    assert document.path is not None
    about = (
        prose_check.crutch_lemmas(_story_lines(document, 0, len(document.lines) - 1)),
        grammar_check.names_in(document.text),
    )
    _ABOUT[str(document.path)] = about
    return about


def _known(document: Document) -> tuple[frozenset[str], list[str]]:
    """What was last learned about this document, or nothing yet."""
    return _ABOUT.get(str(document.path), (frozenset(), []))


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
        # Reading the whole document is also the only chance to learn what it is
        # like — which words it wears out, and what its people are called.
        crutches = _learn(self._document)[0] if self._selection is None else frozenset()
        if self.cancelled:
            return
        self.findings = [
            _reported(finding)
            for finding in prose_check.check(
                _story_lines(self._document, start, end), crutches
            )
        ]


class GrammarCheckJob(Job):
    """The grammar pass, which is a model and is therefore slow.

    Its own job so that it is its own wait. The names it must not touch were
    learned when the document was last read whole; a paragraph is in no position
    to work out what the people in the book are called.
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
            _reported(finding)
            for finding in grammar_check.check(
                self._model,
                _story_lines(self._document, start, end),
                _known(self._document)[1],
            )
        ]


def _at(place: prose_check.Place) -> dict[str, int]:
    return {"line": place.line, "character": place.character}


def _reported(finding: prose_check.Finding) -> dict[str, Any]:
    """A finding as the editor is told it.

    `message` is what fits under the underline and `detail` is what the author
    reads when they stop on it; a mark that can afford only one of the two ends
    up saying neither well. `kind` is what colour it is drawn in and `rule` is
    what it is — the first for whoever reads the underline, the second for
    whatever has to act on it.
    """
    return {
        "rule": finding.rule,
        "kind": finding.kind,
        "message": finding.message,
        "detail": finding.detail,
        "at": _at(finding.at),
        "end": _at(finding.end),
        "related": [{"at": _at(at), "end": _at(end)} for at, end in finding.related],
        # A rule that already knows what belongs there says so, and the editor
        # puts it in without troubling the model at all.
        "replacements": list(finding.replacements),
    }


@app.post("/check/prose", status_code=202)
def check_prose(request: ProseCheckRequest) -> dict[str, Any]:
    """Start checking a passage; poll /check/prose/status for what it found.

    The whole document when the author turns the checks on, and one paragraph
    when they have just written in it — the same rules over a different span, so
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


@app.post("/check/grammar", status_code=202)
def check_grammar(request: ProseCheckRequest) -> dict[str, Any]:
    """Start the grammar pass over a passage; poll /check/grammar/status for it.

    The same request as a prose check and a separate job, because it is slow and
    the other is not. The editor draws what the rules found while this is still
    reading.
    """
    document = (
        Document(request.text, Path(request.path))
        if request.text is not None
        else _document(request.path)
    )
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




# --- putting one fault right -----------------------------------------------
#
# The counterpart of the checks, and the reason they are worth having beyond the
# underline: a fault that was found by a rule can be described to a model, and
# the same rule can be run over what comes back.
#
# Two things follow from that which correcting a passage cannot have. The model
# is answering a question — these words, this is wrong with them — rather than
# being handed a paragraph and asked what it thinks. And the answer is checked
# before it is offered, because the thing that found the fault is still there to
# ask again. A fix that leaves the rule firing is not a fix.


# A phrase, not a paragraph. What comes back replaces a few words.
FIX_TOKENS = 64

FIX_INSTRUCTION = (
    "You are correcting one phrase in a novel. You are told what is wrong with "
    "it and shown the sentence it sits in. Answer with the replacement for that "
    "phrase and nothing else — no quotation marks, no explanation, and not the "
    "rest of the sentence. Keep the author's voice, tense and register, and "
    "change as little as will put the fault right."
)


class Place(BaseModel):
    # 0-based, as everything the server says about a file is.
    line: int
    character: int


class Span(BaseModel):
    at: Place
    end: Place


class SpanFixRequest(BaseModel):
    # Path of the document the fault is in.
    path: str
    # The document as the author has it, for the same reason a check is given it.
    text: str | None = None
    where: Span
    # What found the fault, which is also what will judge the answer.
    rule: str
    message: str
    detail: str = ""


class SpanFixJob(Job):
    """Rewrite one marked phrase, and refuse the rewrite if it does not work."""

    kind = "span fix"

    def __init__(
        self,
        model: CausalModel,
        document: Document,
        where: Span,
        rule: str,
        message: str,
    ) -> None:
        assert document.path is not None
        super().__init__(f"{document.path}#fix:{where.at.line}:{where.at.character}")
        self._model = model
        self._document = document
        self._where = where
        self._rule = rule
        self._message = message
        self.replacement = ""
        self.verified = False

    def execute(self) -> None:
        line = self._document.lines[self._where.at.line]
        first, last = self._where.at.character, self._where.end.character
        wrong = line[first:last]
        if not wrong.strip():
            return

        answer = self._model.complete(
            FIX_INSTRUCTION,
            _asking(self._rule, self._message, line, first, last),
            max_new_tokens=FIX_TOKENS,
        )
        if self.cancelled:
            return
        self.replacement = _phrase(answer)
        if not self.replacement:
            return

        # The rule that found it is asked again, over the paragraph as it would
        # be — a repetition is only answered if the other half still stands.
        rewritten = line[:first] + self.replacement + line[last:]
        self.verified = not _fires(
            self._rule,
            self._context(rewritten),
            self._where.at.line,
            first,
            first + len(self.replacement),
        )

    def _context(self, rewritten: str) -> list[tuple[int, str]]:
        """The cell's prose with this line as the model would leave it."""
        where = self._document.lines_at(self._where.at.line)
        first, last = where or (self._where.at.line, self._where.at.line)
        return [
            (
                index,
                rewritten if index == self._where.at.line else self._document.lines[index],
            )
            for index, _ in self._document.story_lines(first, last)
        ]


def _asking(rule: str, message: str, line: str, at: int, end: int) -> str:
    """What the model is shown: the sentence, the words, and the complaint.

    The complaint is the whole point. A model handed a paragraph guesses at what
    it is for; a model handed a phrase and told what is wrong with it is doing
    something it can be judged on.
    """
    return (
        f"The sentence:\n\n{line}\n\n"
        f'The phrase to replace: "{line[at:end]}"\n'
        f"What is wrong with it ({rule}): {message}\n\n"
        "Write the replacement phrase."
    )


def _phrase(answer: str) -> str:
    """The phrase out of whatever the model wrapped it in."""
    for said in answer.strip().splitlines():
        said = said.strip().strip('"“”\'')
        if said:
            return said
    return ""


def _fires(
    rule: str, prose: list[tuple[int, str]], line: int, at: int, end: int
) -> bool:
    """Whether that rule still finds fault where the fix was put in."""
    return prose_check.fires(rule, prose, line, at, end)


@app.post("/fix/span", status_code=202)
def fix_span(request: SpanFixRequest) -> dict[str, Any]:
    """Start rewriting one marked phrase; poll /fix/span/status for the answer.

    The document is not written. What comes back is a phrase, and where it goes
    is the editor's to say — the mark it belongs to has very likely moved while
    the model was reading, and only the page knows where it is now.
    """
    if request.where.at.line != request.where.end.line:
        raise HTTPException(
            status_code=400, detail="A fault is fixed a line at a time."
        )
    document = (
        Document(request.text, Path(request.path))
        if request.text is not None
        else _document(request.path)
    )
    if request.where.at.line >= len(document.lines):
        raise HTTPException(status_code=400, detail="There is no such line.")
    job = SpanFixJob(
        app.state.causal_model, document, request.where, request.rule, request.message
    )
    app.state.jobs.start(job)
    return {"id": job.target}


@app.get("/fix/span/status")
def fix_span_status(id: str) -> dict[str, Any]:
    """Whether the fix is still being written, what it is, and whether it worked.

    `verified` is the rule's own answer, not the model's: it is false when the
    phrase came back and the fault is still there. The editor shows the author
    what was offered and leaves the prose alone.
    """
    job = app.state.jobs.get(id)
    if not isinstance(job, SpanFixJob):
        raise HTTPException(status_code=404, detail=f"No span fix for {id}")
    return {
        "running": not job.done,
        "cancelled": job.cancelled,
        "error": job.error,
        "replacement": job.replacement,
        "verified": job.verified,
    }
