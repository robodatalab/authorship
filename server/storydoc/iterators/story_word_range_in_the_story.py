from __future__ import annotations

from dataclasses import dataclass

from server.storydoc.cells.story_word_range import StoryWordRange


@dataclass(frozen=True)
class StoryWordRangeInTheStory(StoryWordRange):
    cell_id: str
    words_it_covers: str
