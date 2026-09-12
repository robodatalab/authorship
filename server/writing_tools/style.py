"""Upgrade the style of the document."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from server import storydoc
from server.jobs import Job
from server.models.gemini import GeminiError
from server.storydoc import Document

SEAM = "<!-- section -->"
_SEAM_LINE = re.compile(r"^[ \t]*<!--[ \t]*section[ \t]*-->[ \t]*$", re.MULTILINE)
_FENCED = re.compile(r"\A\s*```[a-zA-Z]*\n(?P<body>.*)\n```\s*\Z", re.DOTALL)
_HEADING = re.compile(r"\A[ \t]*#{1,6}[ \t]*(?P<said>.+?)[ \t]*(?:\n|\Z)")
THINKING_HEADROOM = 8192
SHORTEST = 0.6
LONGEST = 1.8
_FINISHED = tuple(".!?\u2026\"'\u201d\u2019\u00bb)]}*_`")
CONTEXT_CHARS = 400_000

STYLE_INSTRUCTION = (
    "You are copy-editing a novel, one chapter at a time. Fix the grammar and "
    "improve the writing style: clumsy sentences, wrong words, tangled clauses, "
    "repetition, punctuation. Do not rewrite the story. The events, the names, "
    "the dialogue and the author's voice stay as they are, nothing is added and "
    "nothing is cut, and a chapter comes back about as long as it went in. Keep "
    "the markdown exactly as it is written, and keep every HTML comment exactly "
    "where it stands — those are the author's notes to themselves and are not "
    f"yours to touch. Keep the `{SEAM}` lines: your answer must have the same "
    "number of them as the chapter you were given, in the same places. Answer "
    "with the corrected chapter and nothing else: no title, no heading, no "
    "explanation, no code fence."
)

FIX_REQUEST = "Fix the writing style and the grammar in the following chapter."


class Editor(Protocol):
    def complete(self, instruction: str, said: str, max_new_tokens: int, /) -> str: ...


@dataclass(frozen=True)
class Section:
    cell_id: str
    source: str


@dataclass
class Chapter:
    title: str
    sections: list[Section] = field(default_factory=list)

    @property
    def text(self) -> str:
        """The chapter as the model is given it: its sections, seams between."""
        return f"\n\n{SEAM}\n\n".join(section.source for section in self.sections)

    @property
    def plain(self) -> str:
        """The chapter as it reads, which is what a later chapter is shown of it.

        No seams: where this chapter happened to be cut is nothing the next one
        has to agree with, and a seam carried into the context is one more of
        them for the model to miscount.
        """
        return "\n\n".join(section.source for section in self.sections)


def chapters_of(document: Document) -> list[Chapter]:
    """Each chapter with prose under it, and the sections that prose is in.

    A chapter runs to the next chapter: everything between the two belongs to
    it, however many sections that is and whatever else stands among them. Only
    the markdown is taken — the story is written in markdown sections and every
    other kind of cell is something said *about* the book.

    What stands before the first chapter is a cover, a title page, a dedication.
    It belongs to no chapter and is not corrected.
    """
    found: list[Chapter] = []
    for cell in document.cells:
        if cell.kind == storydoc.CHAPTER:
            found.append(Chapter(cell.title or f"Chapter {len(found) + 1}"))
        elif found and cell.kind == storydoc.MARKDOWN and cell.source.strip():
            found[-1].sections.append(Section(cell.unique_id, cell.source))
    return [chapter for chapter in found if chapter.sections]


def fix_style(
    model: Editor,
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda fixed, chapters: None,
    revised: Callable[[str, str], None] = lambda cell_id, source: None,
    left_alone: Callable[[str, str], None] = lambda title, why: None,
) -> None:
    """Correct the style and grammar of every chapter, in the order they are read.

    `progress` is told how many chapters are done of how many, and is told the
    total before the first is read — so a caller drawing a bar has its length
    before it has anything to fill it with. `revised` is told each corrected
    section the moment its chapter comes back, rather than all of them at the
    end: a pass over a novel is minutes long, and an author watching it work is
    owed the chapters as they land.

    Nothing is written here. The corrected sections go back to the editor, which
    puts them in the document as one edit per chapter — so the author can undo
    the pass the way they undo anything else, and a job that failed halfway
    leaves a document that is half corrected rather than half written.

    Raises `ValueError` if the document has no chapters with prose under them.
    """
    chapters = chapters_of(document)
    if not chapters:
        raise ValueError("There are no chapters there to correct.")

    corrected: list[tuple[str, str]] = []
    progress(0, len(chapters))
    for fixed, chapter in enumerate(chapters, start=1):
        if cancelled():
            return
        sections, why = _corrected(model, corrected, chapter)
        if cancelled():
            return
        if why:
            left_alone(chapter.title, why)
        # A chapter we cannot put back where it came from is carried as the
        # author wrote it, so the chapters after it still read in a book that
        # makes sense.
        corrected.append(
            (chapter.title, chapter.plain if sections is None else "\n\n".join(sections))
        )
        if sections is not None:
            for section, source in zip(chapter.sections, sections):
                if source != section.source:
                    revised(section.cell_id, source)
        progress(fixed, len(chapters))


def _corrected(
    model: Editor, corrected: list[tuple[str, str]], chapter: Chapter
) -> tuple[list[str] | None, str]:
    try:
        answer = model.complete(
            STYLE_INSTRUCTION,
            _reading(corrected, chapter),
            len(chapter.text) + THINKING_HEADROOM,
        )
    except GeminiError as ge:
        if not ge.one_chapter:
            raise
        return None, str(ge)
    return _sections_of(answer, chapter)


def _reading(corrected: list[tuple[str, str]], chapter: Chapter) -> str:
    """What the model is shown: the book as far as it has been corrected, and
    then the chapter to correct.

    The corrected chapters rather than the original ones, so that the second
    half of a book is edited towards the first half as this pass left it and not
    towards the draft it is replacing.
    """
    said: list[str] = []
    carried = _within_budget(corrected)
    if carried:
        said.append(
            "The chapters of this book that have already been corrected, so that "
            "the voice, the tense and the names stay the same:\n"
        )
        said.extend(f"### {title}\n\n{text}\n" for title, text in carried)
        said.append("---\n")
    said.append(FIX_REQUEST)
    said.append(f'\nThe chapter is called "{chapter.title}".\n')
    said.append(chapter.text)
    return "\n".join(said)


def _within_budget(corrected: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """As many of the corrected chapters as fit, nearest the one being read.

    Dropped from the front rather than the back: what the chapter about to be
    corrected has to agree with is the chapter before it.
    """
    kept: list[tuple[str, str]] = []
    room = CONTEXT_CHARS
    for title, text in reversed(corrected):
        room -= len(text) + len(title)
        if room < 0:
            break
        kept.append((title, text))
    return list(reversed(kept))


def _sections_of(answer: str, chapter: Chapter) -> tuple[list[str] | None, str]:
    """The corrected chapter cut back into its sections, or why it cannot be.

    None is not a failure of the job — it is one chapter that came back in a
    shape it cannot be put back in. Guessing where the seams should have gone
    would move the author's section boundaries on their behalf, which is a worse
    outcome than leaving the chapter as they wrote it.
    """
    said = _unfenced(answer).strip("\n")
    said = _unheaded(said, chapter.title)
    sections = [part.strip("\n") for part in _SEAM_LINE.split(said)]
    if len(sections) != len(chapter.sections) or not all(sections):
        return None, (
            f"it came back as {len(sections)} section(s) where the chapter has "
            f"{len(chapter.sections)}"
        )
    wrong = _unfinished(sections, chapter)
    if wrong:
        return None, wrong
    return sections, ""


def _unfinished(sections: list[str], chapter: Chapter) -> str | None:
    """Why this answer is not the chapter, or None if it might be.

    The seams tell us the answer has the right number of pieces. They say nothing
    about whether those pieces are whole, and an answer cut off against the token
    ceiling has exactly the right number of pieces when the chapter is one
    section — which is most of them.

    Two questions, both about shape rather than about prose, because the thing
    being guarded against is not a bad edit but a fragment. Is it about as long
    as what went in — copy-editing is not summarising — and does it end where a
    sentence ends rather than in the middle of one.
    """
    was = len(chapter.plain)
    now = sum(len(section) for section in sections)
    if not was:
        return None
    if now < SHORTEST * was:
        return f"it came back {now * 100 // was}% of the length it went in as"
    if now > LONGEST * was:
        return f"it came back {now * 100 // was}% of the length it went in as"
    for section in sections:
        ended = section.rstrip()
        if ended and ended[-1] not in _FINISHED:
            return f"it ends mid-sentence, on \u201c{ended[-40:]}\u201d"
    return None


def _unfenced(answer: str) -> str:
    """The answer out of the code fence the model wrapped it in, if it did."""
    fenced = _FENCED.match(answer)
    return fenced.group("body") if fenced else answer


def _unheaded(said: str, title: str) -> str:
    """The chapter without the title the model put back on top of it.

    Only when the heading is the chapter's own name. A `#` line that says
    anything else is the author's, and is part of the prose.
    """
    heading = _HEADING.match(said)
    if heading and heading.group("said").strip().casefold() == title.strip().casefold():
        return said[heading.end() :].lstrip("\n")
    return said


class StyleFixJob(Job):
    """Fix the style of writing in the document using Gemini"""

    kind = "style fix"

    def __init__(self, model: Editor, document: Document) -> None:
        super().__init__(str(document.path))
        self._model = model
        self._document = document
        self.sections: list[dict[str, Any]] = []
        self.fixed = 0
        self.chapters = 0
        self.unauthorized = False
        self.no_quota = False
        self.left_alone: list[dict[str, str]] = []

    def execute(self) -> None:
        try:
            fix_style(
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
