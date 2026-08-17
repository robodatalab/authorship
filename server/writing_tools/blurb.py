"""Writing the blurb for a story — the copy that sells it, not part of it.

A stub. Everything around the writing is real and working: the job it runs as,
the progress the author watches, the text landing back in the cell that asked for
it. What lands is a placeholder that says so.

The model has not been chosen, so nothing here pretends to choose it. When one
is, it takes the same shape `correct_span` does — handed in, asked to complete,
and asked whether it has been cancelled between pieces of work.
"""

from __future__ import annotations

from collections.abc import Callable

from server import storydoc
from server.storydoc import Document


def write_blurb(
    document: Document, cancelled: Callable[[], bool] = lambda: False
) -> str:
    """What the story's blurb will be written as, once there is a model to write it.

    Names the document it ran on, so an author watching the progress bar can see
    it reached the right story rather than only that something happened.
    """
    if cancelled():
        return ""
    chapters = sum(1 for cell in document.cells if cell.kind == storydoc.CHAPTER)
    counted = f"{chapters} {'chapter' if chapters == 1 else 'chapters'}"
    return (
        f"_No blurb has been written for **{document.title}** ({counted}) yet._\n\n"
        "_This is the stub standing in for the writer that will._"
    )
