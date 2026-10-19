from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, TypeVar
from uuid import uuid4

from server.storydoc.cells.cell import Cell

if TYPE_CHECKING:
    from server.storydoc.cells.cell_visitor import CellVisitor

RECAP = "recap"

_Result = TypeVar("_Result")


@dataclass(frozen=True)
class RecapCell(Cell):
    kind: str = field(default=RECAP, init=False)
    documents: str = ""
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> RecapCell:
        return replace(self, source=source)

    def with_folded(self, folded: bool) -> RecapCell:
        return replace(self, folded=folded)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_recap(self)
