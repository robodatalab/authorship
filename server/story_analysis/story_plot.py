from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StoryPlot:
    title: str
    characters: list[str]
    origin: str
    goal: str
    key_events: list[str] = field(default_factory=list)
    lines: set[int] = field(default_factory=set)

    def attributed(self, line: int) -> None:
        self.lines.add(line)
