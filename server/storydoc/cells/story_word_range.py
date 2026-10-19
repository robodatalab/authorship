from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StoryWordRange:
    first_word: int
    last_word: int
