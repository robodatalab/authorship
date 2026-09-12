"""Everything wrong with a passage: the rules first, then the model."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from vramen import Seq2SeqModel

from server.jobs import Job
from server.storydoc import Document
from server.writing_tools import grammar_check, prose_check


def _check_target(path: Path, selection: tuple[int, int] | None) -> str:
    where = "all" if selection is None else f"{selection[0]}-{selection[1]}"
    return f"{path}#{where}"


def _story_lines(document: Document, start: int, end: int) -> list[tuple[int, str]]:
    return [
        (index, document.lines[index])
        for index, _ in document.story_lines(start, end)
    ]


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
        model: Seq2SeqModel,
        document: Document,
        selection: tuple[int, int] | None,
    ) -> None:
        assert document.path is not None
        super().__init__(_check_target(document.path, selection))
        self._model = model
        self._document = document
        self._selection = selection
        self.findings: list[dict[str, Any]] = []

    def execute(self) -> None:
        start, end = self._selection or (0, len(self._document.lines) - 1)
        crutches = (
            prose_check.crutch_lemmas(
                _story_lines(self._document, 0, len(self._document.lines) - 1)
            )
            if self._selection is None
            else frozenset()
        )
        if self.cancelled:
            return
        passage = _story_lines(self._document, start, end)
        by_the_rules = [
            error
            for finding in prose_check.check(passage, crutches)
            for error in _errors_of(self._document, finding)
        ]
        self.findings = by_the_rules
        if self.cancelled:
            return
        self.findings = by_the_rules + [
            error
            for finding in grammar_check.check(
                self._model, passage, grammar_check.names_in(self._document.text)
            )
            for error in _errors_of(self._document, finding)
        ]
