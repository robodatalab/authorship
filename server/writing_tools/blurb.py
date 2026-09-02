"""Writing the blurb for a story — the copy that sells it, not part of it.

The book is read the way a reader reads it. The first chapter is given a blurb of
its own; every chapter after it goes to the model with the blurb so far, and what
comes back is the blurb the book has earned by that point. The last chapter's
answer is the blurb. Nothing ever has to hold the whole manuscript at once, which
is what makes a novel writable on a machine that fits one chapter in a prompt.

What goes in is the story and only the story, which is `reading.chapters_of`'s
answer rather than this module's: the markers, the notes in the margin, the table
of contents and a blurb already in the document are all left out there, for every
tool that reads a book rather than for this one.
"""

from __future__ import annotations

from collections.abc import Callable

from vramen import CausalModel

from server.storydoc import Document
from server.writing_tools.reading import chapters_of

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
    chapters = chapters_of(document)
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
