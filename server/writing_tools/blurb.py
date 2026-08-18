"""Writing the blurb for a story — the copy that sells it, not part of it.

The book is read the way a reader reads it. The first chapter is given a blurb of
its own; every chapter after it goes to the model with the blurb so far, and what
comes back is the blurb the book has earned by that point. The last chapter's
answer is the blurb. Nothing ever has to hold the whole manuscript at once, which
is what makes a novel writable on a machine that fits one chapter in a prompt.

What goes in is the story and only the story. The markers are the format's, the
notes in the margin are the author's, a table of contents is written rather than
told, and a blurb already in the document is this tool's own last word — none of
them are what the book is about.
"""

from __future__ import annotations

from collections.abc import Callable

from vramen import CausalModel

from server import storydoc
from server.storydoc import Document

# A blurb that runs longer than this has stopped being a blurb.
BLURB_TOKENS = 320

BLURB_INSTRUCTION = (
    "You write the back-cover blurb for a novel. A blurb is three or four "
    "sentences that make a stranger in a bookshop want to read it: who the story "
    "is about, what they are up against, and what it would cost them to lose. It "
    "never gives away the ending, and it never talks about the book as a book — "
    "no 'this chapter', no 'the story follows'. Answer with the blurb and nothing "
    "else."
)


def write_blurb(
    model: CausalModel,
    document: Document,
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda written, chapters: None,
) -> str:
    """The story's blurb, written a chapter at a time.

    `progress` is told how many chapters have been read of how many, and is the
    counterpart of `cancelled`: the two are all this says while it runs, one
    outward and one in. It is told the total before the first chapter is read, so
    a caller drawing a bar has its length before it has anything to fill it with.

    A cancelled job answers with nothing rather than with the blurb for the half
    of the book it had read — the editor puts what comes back in the author's
    document, and a blurb for the first three chapters is worse there than none.

    Raises `ValueError` if the document has no chapters with prose in them: a
    blurb for an empty book is one the model has to invent.
    """
    chapters = _chapters(document)
    if not chapters:
        raise ValueError("There is no story there to write a blurb for.")

    blurb = ""
    progress(0, len(chapters))
    for written, (title, prose) in enumerate(chapters, start=1):
        if cancelled():
            return ""
        blurb = model.complete(
            BLURB_INSTRUCTION,
            _reading(document.title, blurb, title, prose),
            max_new_tokens=BLURB_TOKENS,
        ).strip()
        progress(written, len(chapters))
    return blurb


def _reading(book: str, blurb: str, title: str, prose: str) -> str:
    """What the model is shown: the book so far, said in one turn.

    The blurb is carried rather than the chapters, so the conversation stays the
    same length whether the novel is three chapters or ninety.
    """
    if not blurb:
        return (
            f'The book is called "{book}". Its first chapter, "{title}":\n\n'
            f"{prose}\n\n"
            "Write the blurb."
        )
    return (
        f'The book is called "{book}". The blurb so far:\n\n{blurb}\n\n'
        f'The next chapter, "{title}":\n\n{prose}\n\n'
        "Write the blurb again, now that you have read this far. Keep what still "
        "holds and drop what the chapter has overtaken. It is a blurb for the "
        "book, not for the chapter."
    )


def _chapters(document: Document) -> list[tuple[str, str]]:
    """Each chapter that has prose under it, and that prose.

    The document is asked which of its lines are story rather than read for it
    here — a second reader of the format is a second thing to keep in step, and
    this one would have to know about comments and built cells to get it right.

    What stands before the first chapter is a title page, a cover, a dedication.
    It is about the book and belongs to no chapter, so it is not read.
    """
    found: list[tuple[str, list[tuple[int, str]]]] = []
    for placed in document.placed:
        if placed.cell.kind == storydoc.CHAPTER:
            found.append((placed.cell.title or f"Chapter {len(found) + 1}", []))
        elif found and placed.at and placed.cell.kind not in storydoc.PRIVATE_KINDS:
            found[-1][1].extend(document.story_lines(*placed.at))
    return [(title, _prose(lines)) for title, lines in found if lines]


def _prose(lines: list[tuple[int, str]]) -> str:
    """Those lines with the breaks between their paragraphs put back.

    The story comes back as the lines that carry it, so where a paragraph ended
    survives only as the gap in their numbering. Run together without it a
    chapter arrives as one block, and reads to the model as one thought.
    """
    written: list[str] = []
    previous: int | None = None
    for index, said in lines:
        if previous is not None and index != previous + 1:
            written.append("")
        written.append(said)
        previous = index
    return "\n".join(written)
