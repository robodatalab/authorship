from __future__ import annotations

import random
from dataclasses import dataclass

from torch.utils.data import Dataset

from server.storydoc.cells.salient_concept_cell import SalientConceptCell
from server.storydoc.cells.story_word_range import StoryWordRange
from server.storydoc.iterators.story_words_iterator import StoryWordsIterator
from server.storydoc.storydoc import Document

UNRELATED_TEXTS_PER_CONCEPT = 8
FEWEST_EXAMPLES = 1


@dataclass(frozen=True)
class SalientConceptExamples:
    abstract: str
    related_examples: list[str]
    unrelated_texts: list[str]


@dataclass(frozen=True)
class SalientConceptTexts:
    abstract: str
    examples: list[str]
    unrelated_texts: list[str]


def distinct_ranges(word_ranges: list[StoryWordRange]) -> list[StoryWordRange]:
    ranges_by_words = {
        (word_range.first_word, word_range.last_word): word_range for word_range in word_ranges
    }
    words_in_reading_order = sorted(ranges_by_words)
    ranges = [ranges_by_words[words] for words in words_in_reading_order]
    return ranges


def concept_covers(concept: SalientConceptCell, span: StoryWordRange) -> bool:
    return any(
        reference.story_word_range.first_word <= span.first_word
        and span.last_word <= reference.story_word_range.last_word
        for reference in concept.references
    )


def salient_concept_texts(
        document: Document,
        concept: SalientConceptCell,
        concepts_of_the_story: list[SalientConceptCell]
        ) -> SalientConceptTexts:
    concept_ranges = [reference.story_word_range for reference in concept.references]
    own_ranges = distinct_ranges(concept_ranges)
    story_words = StoryWordsIterator(document)
    examples = [story_words.text(r) for r in own_ranges]
    ranges_of_the_story = [
        reference.story_word_range
        for other in concepts_of_the_story
        for reference in other.references
    ]
    distinct_ranges_of_the_story = distinct_ranges(ranges_of_the_story)
    unrelated_texts = [
        story_words.text(r)
        for r in distinct_ranges_of_the_story
        if not concept_covers(concept, r)
    ]
    texts = SalientConceptTexts(concept.source, examples, unrelated_texts)
    return texts


class SalientConceptsDataset(Dataset[SalientConceptExamples]):

    def __init__(self, annotated_stories: list[Document], rng: random.Random) -> None:
        self._rng = rng
        self._concepts: list[SalientConceptTexts] = []
        for story in annotated_stories:
            concepts_of_the_story = story.salient_concepts()
            for concept in concepts_of_the_story:
                texts = salient_concept_texts(story, concept, concepts_of_the_story)
                if len(texts.examples) >= FEWEST_EXAMPLES and texts.unrelated_texts:
                    self._concepts.append(texts)

    def __len__(self) -> int:
        return len(self._concepts)

    def __getitem__(self, concept_idx: int) -> SalientConceptExamples:
        concept = self._concepts[concept_idx]
        unrelated_count = min(len(concept.unrelated_texts), UNRELATED_TEXTS_PER_CONCEPT)
        drawn_unrelated_texts = self._rng.sample(concept.unrelated_texts, unrelated_count)
        salient_concept_examples = SalientConceptExamples(
            concept.abstract,
            concept.examples,
            drawn_unrelated_texts,
        )
        return salient_concept_examples
