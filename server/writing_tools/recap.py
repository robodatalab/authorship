"""Writing the story so far — what a reader needs before they open this volume.

The blurb's near relation, and read the same way: a chapter at a time, carrying
the summary rather than the chapters, so the conversation stays one chapter long
whether what came before was three of them or ninety. The two differ in what
they are for and therefore in what they say. A blurb sells a book it must not
give away; a recap gives away everything, because the reader it is written for
has read those volumes and is being reminded what happened in them.

The other difference is where the story comes from. A blurb is written from the
document it lands in; a recap is written from the documents *before* it — the
earlier `.author` files of a serial, named by the section that asks for it. They
are read in alphabetical order, which is the order `parts/part_1.author`,
`part_2.author` and their like already stand in.
"""

from __future__ import annotations

from collections.abc import Callable

from vramen import CausalModel

from server.storydoc import Document
from server.writing_tools.reading import chapters_of

# Longer than a blurb because it is doing the opposite job: a blurb withholds the
# story and this one is the story, and a reader who has to be reminded of three
# volumes cannot be reminded of them in four sentences.
RECAP_TOKENS = 900

RECAP_INSTRUCTION = (
    "You write the 'story so far' that opens a later volume of a serial. It is "
    "for a reader who read the earlier volumes some time ago and needs reminding "
    "what happened in them: who the people are, what they did, where the story "
    "has left them, and what is still unresolved. Give the ending away — that is "
    "what it is for. Write it in the present tense, as continuous prose, and "
    "never talk about the book as a book: no 'this volume', no 'the story "
    "follows'. Answer with the recap and nothing else."
)


def write_recap(
    model: CausalModel,
    documents: list[Document],
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda written, chapters: None,
) -> str:
    """The story so far, written a chapter at a time out of the earlier volumes.

    `documents` arrive in the order they are to be read; each is read to the end
    before the next is opened, so the summary is built in the order the story
    happened rather than in the order the files were named.

    `progress` is told how many chapters have been read of how many across all of
    them, and is the counterpart of `cancelled`: the two are all this says while
    it runs, one outward and one in. It is told the total before the first
    chapter is read, so a caller drawing a bar has its length before it has
    anything to fill it with.

    A cancelled job answers with nothing rather than with the story so far as far
    as it had got — what comes back goes into the author's document, and a recap
    that stops halfway through the second volume is worse there than none.

    Raises `ValueError` if none of the documents has a chapter with prose in it:
    a recap of an empty story is one the model has to invent.
    """
    chapters = [
        (document.title, title, prose)
        for document in documents
        for title, prose in chapters_of(document)
    ]
    if not chapters:
        raise ValueError("There is no story in those documents to summarise.")

    recap = ""
    progress(0, len(chapters))
    for written, (book, title, prose) in enumerate(chapters, start=1):
        if cancelled():
            return ""
        recap = model.complete(
            RECAP_INSTRUCTION,
            _reading(recap, book, title, prose),
            max_new_tokens=RECAP_TOKENS,
        ).strip()
        progress(written, len(chapters))
    return recap


def _reading(recap: str, book: str, title: str, prose: str) -> str:
    """What the model is shown: the story so far, and the next chapter of it.

    The volume is named on every turn rather than only when it changes. Which
    book a chapter came out of is a fact about that chapter, and a model told it
    once at the top of a fold has been told it in a turn it can no longer see.
    """
    if not recap:
        return (
            f'The first chapter of "{book}", "{title}":\n\n{prose}\n\n'
            "Write the story so far."
        )
    return (
        f"The story so far:\n\n{recap}\n\n"
        f'The next chapter, "{title}", from "{book}":\n\n{prose}\n\n'
        "Write the story so far again, now that you have read this far. Keep "
        "what a reader still needs and drop what the chapter has settled. It is "
        "the story so far, not a summary of this chapter."
    )
