from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

from server.storydoc.cells.story_word_range import StoryWordRange
from server.storydoc.iterators.prose_cells_iterator import ProseCellsIterator
from server.storydoc.iterators.story_text_span import StoryTextSpan
from server.storydoc.iterators.story_word import StoryWord
from server.storydoc.iterators.text_words_iterator import TextWordsIterator

if TYPE_CHECKING:
    from server.storydoc.storydoc import Document


class StoryWordsIterator:
    def __init__(self, document: Document) -> None:
        self._document = document

    def __iter__(self) -> Iterator[StoryWord]:
        number = 0
        prose_cells = ProseCellsIterator(self._document)
        for cell in prose_cells:
            text_words = TextWordsIterator(cell.source)
            for word in text_words:
                yield StoryWord(
                    number,
                    cell.unique_id,
                    word.text,
                    word.start_character_offset,
                    word.end_character_offset,
                )
                number += 1

    def text(self, story_word_range: StoryWordRange) -> str:
        spans = self.spans(story_word_range)
        texts_of_the_cells: list[str] = []
        for span in spans:
            cell = self._document.cell_with_id(span.cell_id)
            start = span.start_character_offset_in_cell
            end = span.end_character_offset_in_cell
            text_of_the_cell = cell.source[start:end] if cell else ""
            texts_of_the_cells.append(text_of_the_cell)
        return "\n\n".join(texts_of_the_cells)

    def spans(self, story_word_range: StoryWordRange) -> list[StoryTextSpan]:
        spans: list[StoryTextSpan] = []
        for word in self:
            if word.number > story_word_range.last_word:
                break
            if word.number < story_word_range.first_word:
                continue
            if spans and spans[-1].cell_id == word.cell_id:
                span_before = spans[-1]
                spans[-1] = StoryTextSpan(
                    span_before.cell_id,
                    span_before.start_character_offset_in_cell,
                    word.end_character_offset_in_cell,
                )
            else:
                span = StoryTextSpan(
                    word.cell_id,
                    word.start_character_offset_in_cell,
                    word.end_character_offset_in_cell,
                )
                spans.append(span)
        return spans

    def range_between(
        self,
        cell_id: str,
        start_character_offset_in_cell: int,
        end_character_offset_in_cell: int,
    ) -> StoryWordRange | None:
        words_touched = [
            word
            for word in self
            if word.cell_id == cell_id
            and word.start_character_offset_in_cell < end_character_offset_in_cell
            and start_character_offset_in_cell < word.end_character_offset_in_cell
        ]
        if not words_touched:
            return None
        return StoryWordRange(words_touched[0].number, words_touched[-1].number)
