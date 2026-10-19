from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass

_RUN_OF_NON_SPACES = re.compile(r"\S+")
_WORD_CHARACTER = re.compile(r"\w", re.ASCII)


@dataclass(frozen=True)
class TextWord:
    text: str
    start_character_offset: int
    end_character_offset: int


class TextWordsIterator:
    def __init__(self, text: str) -> None:
        self._text = text

    def __iter__(self) -> Iterator[TextWord]:
        for run in _RUN_OF_NON_SPACES.finditer(self._text):
            if _WORD_CHARACTER.search(run.group()):
                yield TextWord(run.group(), run.start(), run.end())
