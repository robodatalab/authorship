from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

from server.storydoc.iterators.story_lines_iterator import StoryLinesIterator

if TYPE_CHECKING:
    from server.storydoc.cells.cell import Cell
    from server.storydoc.storydoc import Document


class ChapterLinesIterator:
    def __init__(self, document: Document, cells: list[Cell]) -> None:
        self._document = document
        self._cells = cells

    def __iter__(self) -> Iterator[tuple[int, str]]:
        for cell in self._cells:
            if cell.at is None:
                continue
            first, final = cell.at
            lines_of_the_cell = StoryLinesIterator(self._document, first, final)
            yield from lines_of_the_cell

    def text(self) -> str:
        lines = [line for _, line in self]
        return "\n".join(lines)
