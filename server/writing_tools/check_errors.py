"""Everything wrong with a passage: the rules first, then the model."""

from __future__ import annotations

import asyncio

from pathlib import Path
from typing import Any

import cortexgrid
from cortexgrid_infer import RewritingModel

from server.jobs import Job
from authordoc.iterators.story_lines_iterator import StoryLinesIterator
from authordoc.storydoc import Document
from server.writing_tools import grammar_check, prose_check


def _check_target(path: Path, selection: tuple[int, int] | None) -> str:
    where = "all" if selection is None else f"{selection[0]}-{selection[1]}"
    return f"{path}#{where}"


def _errors_of(
    document: Document, finding: prose_check.Finding
) -> list[dict[str, Any]]:
    errors = []
    for at, end in [(finding.at, finding.end), *finding.related]:
        cell = document.cell_at(at.line)
        if cell is None or cell is not document.cell_at(end.line):
            continue
        errors.append(
            {
                "cellId": cell.unique_id,
                "startCharacterOffsetInCell": cell.offset_of(at.line, at.character),
                "endCharacterOffsetInCell": cell.offset_of(end.line, end.character),
                "wordsInTheCell": cell.source[
                    cell.offset_of(at.line, at.character) : cell.offset_of(
                        end.line, end.character
                    )
                ],
                "isVisible": True,
                "ruleThatFoundTheError": finding.rule,
                "isAnErrorOf": "style" if finding.kind == "style" else "grammar",
                "reasonForError": finding.detail,
                "correctVersion": finding.replacements[0]
                if finding.replacements
                else "",
            }
        )
    return errors


class CheckErrorsJob(Job):
    """The rules and then the grammar model, over the same passage.

    The rules are a hundred times faster than the model, so what they found is
    published the moment they are done rather than waiting on it: an author
    polling this job is drawing marks while the model is still reading.
    """

    kind = "check errors"

    def __init__(
        self,
        deployment: cortexgrid.Deployment[RewritingModel],
        path: Path,
        story: str,
        selection: tuple[int, int] | None,
    ) -> None:
        super().__init__(_check_target(path, selection))
        self._deployment = deployment
        self._path = path
        self._story = story
        self._selection = selection
        self.findings: list[dict[str, Any]] = []

    async def execute(self) -> None:
        model = self._deployment.client_async()
        document = Document(self._story, self._path)
        start, end = self._selection or (0, len(document.lines) - 1)
        crutches = (
            prose_check.crutch_lemmas(list(StoryLinesIterator(document)))
            if self._selection is None
            else frozenset()
        )
        passage = list(StoryLinesIterator(document, start, end))
        by_the_rules = [
            error
            for finding in await asyncio.to_thread(prose_check.check, passage, crutches)
            for error in _errors_of(document, finding)
        ]
        self.findings = by_the_rules
        self.findings = by_the_rules + [
            error
            for finding in await grammar_check.check(
                model, passage, grammar_check.names_in(document.text)
            )
            for error in _errors_of(document, finding)
        ]

    def snapshot(self) -> dict[str, Any]:
        return {"findings": self.findings}
