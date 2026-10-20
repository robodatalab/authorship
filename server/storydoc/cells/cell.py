from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, TypeVar

if TYPE_CHECKING:
    from server.storydoc.cells.cell_visitor import CellVisitor

_Result = TypeVar("_Result")


class Cell(ABC):
    """One thing the document is made of, and what it says it is.

    `kind` is the cell's identity and is never inferred from its text — a chapter
    called "Disclaimer" is still a chapter.
    """

    kind: str
    source: str
    folded: bool
    at: tuple[int, int] | None
    _unique_id: str

    @property
    def unique_id(self) -> str:
        return self._unique_id

    def offset_of(self, line: int, character: int) -> int:
        assert self.at is not None
        above = self.source.splitlines()[: line - self.at[0]]
        return sum(len(written) + 1 for written in above) + character

    @abstractmethod
    def with_source(self, source: str) -> Cell: ...

    @abstractmethod
    def with_folded(self, folded: bool) -> Cell: ...

    @abstractmethod
    def accept(self, visitor: CellVisitor[_Result]) -> _Result: ...
