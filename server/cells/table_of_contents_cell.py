from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, TypeVar
from uuid import uuid4

from server.cells.cell import Cell

if TYPE_CHECKING:
    from server.cells.cell_visitor import CellVisitor

TABLE_OF_CONTENTS = "contents"

_Result = TypeVar("_Result")


@dataclass(frozen=True)
class TableOfContentsCell(Cell):
    kind: str = field(default=TABLE_OF_CONTENTS, init=False)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> TableOfContentsCell:
        return replace(self, source=source)

    def with_folded(self, folded: bool) -> TableOfContentsCell:
        return replace(self, folded=folded)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_table_of_contents(self)
