from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

from server.storydoc.cells.markdown_cell import MarkdownCell

if TYPE_CHECKING:
    from server.storydoc.storydoc import Document


class ProseCellsIterator:
    def __init__(self, document: Document) -> None:
        self._document = document

    def __iter__(self) -> Iterator[MarkdownCell]:
        for cell in self._document.cells:
            if isinstance(cell, MarkdownCell):
                yield cell
