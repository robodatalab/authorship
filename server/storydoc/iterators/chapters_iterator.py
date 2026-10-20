from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

from server.storydoc.cells.chapter_cell import ChapterCell
from server.storydoc.iterators.chapter_lines_iterator import ChapterLinesIterator

if TYPE_CHECKING:
    from server.storydoc.cells.cell import Cell
    from server.storydoc.storydoc import Document


class ChaptersIterator:
    """The raw contents of chapters - stripped of comments and any other information"""

    def __init__(self, document: Document) -> None:
        self._document = document

    def __iter__(self) -> Iterator[tuple[str, ChapterLinesIterator]]:
        chapters_found = 0
        title: str | None = None
        cells_of_the_chapter: list[Cell] = []
        for cell in self._document.cells:
            if isinstance(cell, ChapterCell):
                if title is not None:
                    chapter_lines = ChapterLinesIterator(
                        self._document, cells_of_the_chapter
                    )
                    yield title, chapter_lines
                chapters_found += 1
                title = cell.title or f"Chapter {chapters_found}"
                cells_of_the_chapter = []
            elif title is not None:
                cells_of_the_chapter.append(cell)
        if title is not None:
            chapter_lines = ChapterLinesIterator(
                self._document, cells_of_the_chapter
            )
            yield title, chapter_lines
