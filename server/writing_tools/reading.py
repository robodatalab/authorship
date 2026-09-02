"""Reading a story document the way a reader reads it: chapter by chapter.

Every tool here that is told to read the whole book reads it in the same units
and leaves out the same things, so this is where both are said once. The markers
are the format's, the notes in the margin are the author's, a table of contents
is written rather than told, and a blurb or a recap already in the document is
another tool's last word — none of them are what the book is about.

The document is asked which of its lines are story rather than read for it here:
a second reader of the format is a second thing to keep in step, and this one
would have to know about comments and built cells to get it right.
"""

from __future__ import annotations

from server import storydoc
from server.storydoc import Document


def chapters_of(document: Document) -> list[tuple[str, str]]:
    """Each chapter that has prose under it, and that prose.

    What stands before the first chapter is a title page, a cover, a dedication.
    It is about the book and belongs to no chapter, so it is not read.
    """
    found: list[tuple[str, list[tuple[int, str]]]] = []
    for placed in document.placed:
        if placed.cell.kind == storydoc.CHAPTER:
            found.append((placed.cell.title or f"Chapter {len(found) + 1}", []))
        elif found and placed.at and placed.cell.kind not in storydoc.PRIVATE_KINDS:
            found[-1][1].extend(document.story_lines(*placed.at))
    return [(title, prose_of(lines)) for title, lines in found if lines]


def prose_of(lines: list[tuple[int, str]]) -> str:
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
