from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextWord:
    text: str
    start_character_offset: int
    end_character_offset: int
