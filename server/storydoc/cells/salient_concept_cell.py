from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, TypeVar
from uuid import uuid4

from server.storydoc.cells.cell import Cell
from server.storydoc.cells.story_word_range import StoryWordRange

if TYPE_CHECKING:
    from server.storydoc.cells.cell_visitor import CellVisitor

SALIENT_CONCEPT = "salient-concept"


@dataclass(frozen=True)
class SalientConceptReference:
    reference_id: str
    story_word_range: StoryWordRange

_Result = TypeVar("_Result")


@dataclass(frozen=True)
class SalientConceptCell(Cell):
    kind: str = field(default=SALIENT_CONCEPT, init=False)
    title: str = ""
    references: list[SalientConceptReference] = field(default_factory=list)
    source: str = ""
    folded: bool = False
    at: tuple[int, int] | None = field(default=None, compare=False)
    _unique_id: str = field(default_factory=lambda: str(uuid4()))

    def with_source(self, source: str) -> SalientConceptCell:
        return replace(self, source=source)

    def with_folded(self, folded: bool) -> SalientConceptCell:
        return replace(self, folded=folded)

    def accept(self, visitor: CellVisitor[_Result]) -> _Result:
        return visitor.visit_salient_concept(self)
