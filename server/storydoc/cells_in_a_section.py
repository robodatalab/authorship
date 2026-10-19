from __future__ import annotations

from dataclasses import dataclass, field

from server.storydoc.cells.cell import Cell


@dataclass(eq=False)
class CellsInASection:
    cell: Cell
    within: list[CellsInASection] = field(default_factory=list)
