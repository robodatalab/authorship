from __future__ import annotations

from dataclasses import dataclass

from server.storydoc.iterators.story_word_range_in_the_story import (
    StoryWordRangeInTheStory,
)


@dataclass(frozen=True)
class StoryAnnotationInTheStory:
    annotation_cell_id: str
    title: str
    description: str
    passages: list[StoryWordRangeInTheStory]
