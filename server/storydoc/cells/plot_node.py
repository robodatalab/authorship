from __future__ import annotations

from dataclasses import dataclass

from server.storydoc.cells.story_word_range import StoryWordRange


@dataclass(frozen=True)
class PlotNode:
    node_id: str
    story_word_range: StoryWordRange
