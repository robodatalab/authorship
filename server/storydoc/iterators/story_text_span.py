from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StoryTextSpan:
    cell_id: str
    start_character_offset_in_cell: int
    end_character_offset_in_cell: int
