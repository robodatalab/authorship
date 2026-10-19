from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StoryWord:
    number: int
    cell_id: str
    text: str
    start_character_offset_in_cell: int
    end_character_offset_in_cell: int
