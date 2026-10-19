from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING

from server.storydoc.cells.story_word_range import StoryWordRange
from server.storydoc.iterators.story_words_iterator import StoryWordsIterator
from server.storydoc.visitors.annotated_passages_of import AnnotatedPassagesOf

if TYPE_CHECKING:
    from server.storydoc.storydoc import Document


@dataclass(frozen=True)
class StoryWordRangeInTheStory(StoryWordRange):
    cell_id: str
    words_it_covers: str


@dataclass(frozen=True)
class StoryAnnotationInTheStory:
    annotation_cell_id: str
    title: str
    description: str
    passages: list[StoryWordRangeInTheStory]


class StoryAnnotationsIterator:
    def __init__(self, document: Document, cell_kind: str) -> None:
        self._document = document
        self._cell_kind = cell_kind

    def __iter__(self) -> Iterator[StoryAnnotationInTheStory]:
        story_words_iterator = StoryWordsIterator(self._document)
        story_words = list(story_words_iterator)
        annotated_passages_of = AnnotatedPassagesOf()
        for cell in self._document.cells:
            if cell.kind != self._cell_kind:
                continue
            annotated = cell.accept(annotated_passages_of)
            if annotated is None:
                continue
            passages: list[StoryWordRangeInTheStory] = []
            for story_word_range in annotated.story_word_ranges:
                words_covered = [
                    word.text
                    for word in story_words[
                        story_word_range.first_word : story_word_range.last_word + 1
                    ]
                ]
                first_word = (
                    story_words[story_word_range.first_word]
                    if story_word_range.first_word < len(story_words)
                    else None
                )
                cell_id = first_word.cell_id if first_word else ""
                passage = StoryWordRangeInTheStory(
                    story_word_range.first_word,
                    story_word_range.last_word,
                    cell_id,
                    " ".join(words_covered),
                )
                passages.append(passage)
            yield StoryAnnotationInTheStory(
                cell.unique_id, annotated.title, cell.source, passages
            )
