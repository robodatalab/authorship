from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

from server.storydoc.iterators.prose_cells_iterator import ProseCellsIterator
from server.storydoc.parser import split_comments

if TYPE_CHECKING:
    from server.storydoc.storydoc import Document


class StoryLinesIterator:
    """The story itself, line by line: the prose of the markdown cells,
    by the line of the document each is written on."""

    def __init__(
        self, document: Document, start: int = 0, end: int | None = None
    ) -> None:
        self._document = document
        self._start = start
        self._end = end

    def __iter__(self) -> Iterator[tuple[int, str]]:
        lines = self._document.lines
        last = len(lines) - 1 if self._end is None else self._end
        prose_cells = ProseCellsIterator(self._document)
        for cell in prose_cells:
            if cell.at is None:
                continue
            first, final = cell.at
            covered = list(range(first, final + 1))
            covered_lines = [lines[i] for i in covered]
            # A cell's prose may carry the author's own notes, and those are no
            # more story than the markers around them.
            kept_ranges = split_comments(covered_lines, covered)
            for kept_first, kept_last in kept_ranges:
                first_kept = max(kept_first, self._start)
                last_kept = min(kept_last, last)
                for index in range(first_kept, last_kept + 1):
                    if lines[index].strip():
                        yield index, lines[index]
