from __future__ import annotations

from dataclasses import dataclass, field

from server.storydoc import (
    ABOUT,
    BLURB,
    CHAPTER,
    DISCLAIMER,
    PART,
    PLOT,
    RECAP,
    SALIENT_CONCEPT,
    TABLE_OF_CONTENTS,
    TITLE_PAGE,
    Cell,
    Document,
)

_KINDS_THAT_STAND_OUTSIDE_THE_STORY = frozenset(
    {
        TITLE_PAGE,
        TABLE_OF_CONTENTS,
        DISCLAIMER,
        ABOUT,
        BLURB,
        RECAP,
        SALIENT_CONCEPT,
        PLOT,
    }
)


@dataclass(eq=False)
class CellsInASection:
    cell: Cell
    within: list[CellsInASection] = field(default_factory=list)


@dataclass(frozen=True)
class WhereACellStands:
    section: CellsInASection
    among: list[CellsInASection]
    under: tuple[CellsInASection, ...]


def stands_outside_the_story(kind: str) -> bool:
    return kind in _KINDS_THAT_STAND_OUTSIDE_THE_STORY


def opens_a_section(kind: str) -> bool:
    return kind in (PART, CHAPTER)


def a_section_of_kind_holds(section_kind: str, kind: str) -> bool:
    if stands_outside_the_story(kind):
        return False
    if section_kind == PART:
        return kind != PART
    return section_kind == CHAPTER and not opens_a_section(kind)


def cells_by_section(cells: list[Cell]) -> list[CellsInASection]:
    whole_document: list[CellsInASection] = []
    open_sections: list[CellsInASection] = []
    for cell in cells:
        while open_sections and not a_section_of_kind_holds(
            open_sections[-1].cell.kind, cell.kind
        ):
            open_sections.pop()
        section = CellsInASection(cell)
        holder = open_sections[-1].within if open_sections else whole_document
        holder.append(section)
        open_sections.append(section)
    return whole_document


def cells_within_a_section(section: CellsInASection) -> list[Cell]:
    cells_held = [
        cell for held in section.within for cell in cells_within_a_section(held)
    ]
    return [section.cell, *cells_held]


def where_a_cell_stands(
    sections: list[CellsInASection],
    cell_id: str,
    under: tuple[CellsInASection, ...] = (),
) -> WhereACellStands | None:
    for section in sections:
        if section.cell.unique_id == cell_id:
            return WhereACellStands(section, sections, under)
        standing = where_a_cell_stands(section.within, cell_id, (*under, section))
        if standing:
            return standing
    return None


def _where_the_cell_stands(document: Document, cell: Cell) -> int:
    return next(
        (
            index
            for index, in_the_document in enumerate(document.cells)
            if in_the_document.unique_id == cell.unique_id
        ),
        -1,
    )


def _end_of_section(document: Document, section: CellsInASection) -> int:
    stands_at = _where_the_cell_stands(document, section.cell)
    cells_held = cells_within_a_section(section)
    return stands_at + len(cells_held)


def _move_section(document: Document, section: CellsInASection, lands: int) -> None:
    stands_at = _where_the_cell_stands(document, section.cell)
    cells_held = cells_within_a_section(section)
    moved = document.cells[stands_at : stands_at + len(cells_held)]
    del document.cells[stands_at : stands_at + len(cells_held)]
    lands_after_the_move = lands - len(cells_held) if lands > stands_at else lands
    document.cells[lands_after_the_move:lands_after_the_move] = moved


def move_the_section_up(document: Document, cell_id: str) -> None:
    sections = cells_by_section(document.cells)
    standing = where_a_cell_stands(sections, cell_id)
    if standing is None:
        return
    stands_among_at = standing.among.index(standing.section)
    if stands_among_at > 0:
        goes_before = standing.among[stands_among_at - 1]
    elif standing.under:
        goes_before = standing.under[-1]
    else:
        return
    lands = _where_the_cell_stands(document, goes_before.cell)
    _move_section(document, standing.section, lands)


def move_the_section_down(document: Document, cell_id: str) -> None:
    sections = cells_by_section(document.cells)
    standing = where_a_cell_stands(sections, cell_id)
    if standing is None:
        return
    stands_among_at = standing.among.index(standing.section)
    if stands_among_at + 1 < len(standing.among):
        next_in_the_scope = standing.among[stands_among_at + 1]
        lands = _end_of_section(document, next_in_the_scope)
        _move_section(document, standing.section, lands)
        return
    if not standing.under:
        return
    scope_it_leaves = standing.under[-1]
    end_of_the_scope = _end_of_section(document, scope_it_leaves)
    past_the_cell_that_ends_the_scope = end_of_the_scope + 1
    if past_the_cell_that_ends_the_scope <= len(document.cells):
        _move_section(document, standing.section, past_the_cell_that_ends_the_scope)


def remove_the_section(document: Document, cell_id: str) -> None:
    sections = cells_by_section(document.cells)
    standing = where_a_cell_stands(sections, cell_id)
    if standing is None:
        return
    stands_at = _where_the_cell_stands(document, standing.section.cell)
    cells_held = cells_within_a_section(standing.section)
    del document.cells[stands_at : stands_at + len(cells_held)]
