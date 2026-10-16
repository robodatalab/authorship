from __future__ import annotations

import torch
from torch.utils.data import Dataset

from server.storydoc import Document, SalientConceptInTheStory, StoryWordRange


def spans_annotated_in(concepts: list[SalientConceptInTheStory]) -> list[StoryWordRange]:
    annotated_ranges = {
        (word_range.first_word, word_range.last_word): word_range
        for concept in concepts
        for word_range in concept.story_word_ranges
    }
    ranges_in_reading_order = sorted(annotated_ranges)
    spans = [annotated_ranges[word_range] for word_range in ranges_in_reading_order]
    return spans


def concept_covers(concept: SalientConceptInTheStory, span: StoryWordRange) -> bool:
    return any(
        concept_range.first_word <= span.first_word and span.last_word <= concept_range.last_word
        for concept_range in concept.story_word_ranges
    )


class AnnotatedStorySpansDataset(Dataset[dict[str, str | torch.Tensor]]):

    def __init__(self, annotated_stories: list[Document]) -> None:
        concepts_of_each_story = [story.salient_concepts() for story in annotated_stories]
        concept_count = sum(len(concepts) for concepts in concepts_of_each_story)
        self._spans: list[dict[str, str | torch.Tensor]] = []
        first_concept_of_the_story = 0
        for concepts in concepts_of_each_story:
            last_concept_of_the_story = first_concept_of_the_story + len(concepts)
            spans = spans_annotated_in(concepts)
            for span in spans:
                covering_concepts = [concept_covers(concept, span) for concept in concepts]
                concepts_of_the_story_covering_the_span = torch.tensor(covering_concepts, dtype=torch.bool)
                salient_concepts = torch.zeros(concept_count, dtype=torch.bool)
                salient_concepts[first_concept_of_the_story:last_concept_of_the_story] = (
                    concepts_of_the_story_covering_the_span
                )
                annotated_span: dict[str, str | torch.Tensor] = {
                    "text": span.text,
                    "salient_concepts": salient_concepts,
                }
                self._spans.append(annotated_span)
            first_concept_of_the_story = last_concept_of_the_story

    def __len__(self) -> int:
        return len(self._spans)

    def __getitem__(self, span_idx: int) -> dict[str, str | torch.Tensor]:
        return self._spans[span_idx]
