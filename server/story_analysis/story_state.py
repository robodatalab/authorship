from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StoryFact:
    subject: str
    relation: str
    object: str


@dataclass(frozen=True)
class StoryState:
    made_true: frozenset[StoryFact] = frozenset()
    made_false: frozenset[StoryFact] = frozenset()

    def __add__(self, later: StoryState) -> StoryState:
        return StoryState(
            made_true=(self.made_true - later.made_false) | later.made_true,
            made_false=(self.made_false - later.made_true) | later.made_false,
        )

    def __sub__(self, earlier: StoryState) -> StoryState:
        return StoryState(
            made_true=self.made_true - earlier.made_true,
            made_false=self.made_false - earlier.made_false,
        )
