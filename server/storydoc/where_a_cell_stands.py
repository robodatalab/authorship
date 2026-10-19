from __future__ import annotations

from dataclasses import dataclass

from server.storydoc.cells_in_a_section import CellsInASection


@dataclass(frozen=True)
class WhereACellStands:
    section: CellsInASection
    among: list[CellsInASection]
    under: tuple[CellsInASection, ...]
