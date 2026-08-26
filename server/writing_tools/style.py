"""Copy-editing the whole manuscript, a chapter at a time.

The counterpart of the grammar pass over a paragraph, at the other end of the
scale. That one is a minimal-edit model told to change as little as will make a
sentence grammatical; this one is a large model told to read the book and fix
how it is written. The first is what an author asks for while writing a
sentence, the second is what they ask for when the draft is done.

The unit is the chapter, because style is not a property of a sentence. Whether
a paragraph leans on the same construction twice, whether a scene keeps its
tense, whether a name is spelt the way it was spelt in chapter one — none of it
can be seen from inside one paragraph. So each chapter goes to the model with
every chapter already corrected in front of it, and what comes back is the
chapter written the way the corrected ones are.

What goes in is the story and only the story: the chapters' titles and the
markdown written under them. A note the author left themselves, a blurb, a
cover, a table of contents — those are about the book rather than in it, and a
model asked to improve the style of a table of contents will improve it.

A chapter is very often several sections, and it has to come back as the same
several: the author cut them where they wanted them cut. So the sections go in
with a seam between them and are asked to come back with the seams still there.
A chapter whose seams do not survive is left exactly as it was, which is the
only honest thing to do with an answer that cannot be put back.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

from server import storydoc
from server.storydoc import Document

# The line between two sections of one chapter. Written as an HTML comment
# because that is what the format's own markers are, so it reads to the model as
# something structural rather than as something to improve.
SEAM = "<!-- section -->"

_SEAM_LINE = re.compile(r"^[ \t]*<!--[ \t]*section[ \t]*-->[ \t]*$", re.MULTILINE)

# A fence the model wrapped the whole answer in, despite being asked not to.
_FENCED = re.compile(r"\A\s*```[a-zA-Z]*\n(?P<body>.*)\n```\s*\Z", re.DOTALL)

# A heading the model put back at the top of the chapter, despite being asked
# not to. Only stripped when it says what the chapter is already called — a
# heading the author wrote inside their own prose is theirs.
_HEADING = re.compile(r"\A[ \t]*#{1,6}[ \t]*(?P<said>.+?)[ \t]*(?:\n|\Z)")

# What a corrected chapter is allowed to run to, over the length it went in as.
#
# Generous rather than tight, and counted in characters against a budget in
# tokens — which is about four times the room the chapter actually needs. A
# ceiling is what keeps a model that has started repeating itself from doing it
# for an hour; it is not a target, and a chapter that came back truncated is a
# chapter that cannot be put back at all.
CHAPTER_HEADROOM = 2048


# How much corrected book is carried in front of the chapter being corrected.
#
# The whole of it, until the whole of it stops being sensible: a long novel
# corrected chapter by chapter would otherwise send its opening pages a hundred
# times over, and eventually send more than the model will read. Past the cap
# the oldest chapters are dropped, so what the model has is always the part of
# the book nearest to what it is reading — which is the part the voice has to
# match.
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

# The words the pass is named after, and the sentence the model is actually
# asked. Kept apart from the instruction so that what is asked of it reads the
# same in the prompt as it does in the button that starts it.
FIX_REQUEST = "Fix the writing style and the grammar in the following chapter."


class Editor(Protocol):
    """Anything that can be handed an instruction and a chapter and answer.

    Both `vramen.CausalModel` and `server.writing_tools.gemini.Gemini` satisfy
    it, which is what lets the tests for what this says to a model be written
    without one — and what would let a model running on this machine take the
    work over from Gemini without this module knowing.

    Positional, so a model that calls its arguments something else is still a
    model. The token ceiling is part of the bargain rather than an extra: a
    local model will not generate without one, and a chapter is the longest
    thing anything here asks for.
    """

    def complete(self, instruction: str, said: str, max_new_tokens: int, /) -> str: ...


@dataclass(frozen=True)
class Section:
    """One markdown section of a chapter, and where it sits in the document.

    `index` is the cell's place in the document, which is what the editor needs
    to put the corrected text back — a line span would name a section that has
    moved by the time the next chapter is done.
    """

    index: int
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
    for index, cell in enumerate(document.cells):
        if cell.kind == storydoc.CHAPTER:
            found.append(Chapter(cell.title or f"Chapter {len(found) + 1}"))
        elif found and cell.kind == storydoc.MARKDOWN and cell.source.strip():
            found[-1].sections.append(Section(index, cell.source))
    return [chapter for chapter in found if chapter.sections]


def fix_style(
    model: Editor,
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda fixed, chapters: None,
    revised: Callable[[int, str], None] = lambda index, source: None,
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
        answer = model.complete(
            STYLE_INSTRUCTION,
            _reading(corrected, chapter),
            max(CHAPTER_HEADROOM, len(chapter.text)),
        )
        if cancelled():
            return
        sections = _sections_of(answer, chapter)
        # A chapter whose seams did not come back is one we cannot put back
        # where it came from. It is carried as the author wrote it, so the
        # chapters after it still read in a book that makes sense.
        corrected.append(
            (chapter.title, chapter.plain if sections is None else "\n\n".join(sections))
        )
        if sections is not None:
            for section, source in zip(chapter.sections, sections):
                if source != section.source:
                    revised(section.index, source)
        progress(fixed, len(chapters))


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


def _sections_of(answer: str, chapter: Chapter) -> list[str] | None:
    """The corrected chapter cut back into its sections, or None if it cannot be.

    None is not a failure of the job — it is one chapter that came back in a
    shape it cannot be put back in. Guessing where the seams should have gone
    would move the author's section boundaries on their behalf, which is a worse
    outcome than leaving the chapter as they wrote it.
    """
    said = _unfenced(answer).strip("\n")
    said = _unheaded(said, chapter.title)
    sections = [part.strip("\n") for part in _SEAM_LINE.split(said)]
    if len(sections) != len(chapter.sections) or not all(sections):
        return None
    return sections


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
