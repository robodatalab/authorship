"""Writing the story so far — what a reader needs before they open this volume."""

from __future__ import annotations

from collections.abc import Callable

from vramen import CausalModel

from server.storydoc import Document


SUMMARY_TOKENS = 300
SUMMARY_INSTRUCTION = """
Summarize the provided story, focusing on the main characters and events that took place. 
You are given two parts:
- the summary of the previous parts surrounded by <summary_so_far> tokens
- the new part of a manuscript to add to the summary, surrounded by <new_part> tokens

Return the summary that combines the overall text, without adding any tokens.
"""


def write_recap(
    model: CausalModel,
    documents: list[Document],
    cancelled: Callable[[], bool] = lambda: False,
    progress: Callable[[int, int], None] = lambda read, chapters: None,
) -> str:
    chapters = [
        prose
        for document in documents
        for _, prose in document.chapters
    ]
    if not chapters:
        raise ValueError("There is no story in those documents to summarise.")

    running_summary = ""
    progress(0, len(chapters))
    for read, prose in enumerate(chapters, start=1):
        if cancelled():
            return ""

        to_summarize = f"<summary_so_far>\n{running_summary}\n</sumary_so_far><new_part>\n{prose}\n</new_part>"

        new_running_summary = model.complete(
            SUMMARY_INSTRUCTION, to_summarize, max_new_tokens=SUMMARY_TOKENS,
        ).strip()
        running_summary = new_running_summary
        progress(read, len(chapters))

    if cancelled():
        return ""
    
    return running_summary.strip()

