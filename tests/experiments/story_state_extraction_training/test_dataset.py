import unittest

from parameterized import parameterized

from experiments.story_state_extraction_training.dataset import (
    AnnotatedStorySpansDataset,
)
from server.storydoc import Document


class AnnotatedStorySpansDatasetTests(unittest.TestCase):
    @parameterized.expand([
        (
            "no_stories",
            [],
            0,
        ),
        (
            "a_story_without_concepts",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n',
            ],
            0,
        ),
        (
            "a_concept_without_word_ranges",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" -->\n',
            ],
            0,
        ),
        (
            "one_range",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n',
            ],
            1,
        ),
        (
            "the_same_range_of_two_concepts_is_one_span",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Seeing" words="2-3" -->\n',
            ],
            1,
        ),
        (
            "the_same_range_written_twice_is_one_span",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3, 2-3" -->\n',
            ],
            1,
        ),
        (
            "different_ranges_are_different_spans",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Seeing" words="0-3" -->\n',
            ],
            2,
        ),
        (
            "the_same_range_in_two_stories_is_two_spans",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n',
                '<!-- cell: markdown -->\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="2-3" -->\n',
            ],
            2,
        ),
    ])
    def test_hold_one_span_per_range_annotated_in_a_story(
        self, _, story_texts: list[str], expected_span_count: int
    ) -> None:
        annotated_stories = [Document(story_text) for story_text in story_texts]

        annotated_story_spans = AnnotatedStorySpansDataset(annotated_stories)

        self.assertEqual(len(annotated_story_spans), expected_span_count)

    @parameterized.expand([
        (
            "one_concept",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n',
            ],
            0,
            "the door.",
            [True],
        ),
        (
            "the_same_range_of_two_concepts_is_about_both",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Seeing" words="2-3" -->\n',
            ],
            0,
            "the door.",
            [True, True],
        ),
        (
            "a_span_enclosing_another_concept_range_is_not_about_that_concept",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Seeing" words="0-3" -->\n',
            ],
            0,
            "She saw the door.",
            [False, True],
        ),
        (
            "a_span_inside_another_concept_range_is_about_that_concept",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Seeing" words="0-3" -->\n',
            ],
            1,
            "the door.",
            [True, True],
        ),
        (
            "a_span_overlapping_another_concept_range_is_not_about_that_concept",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-4" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Seeing" words="0-3" -->\n',
            ],
            1,
            "the door.\n\nHe",
            [True, False],
        ),
        (
            "a_span_apart_from_another_concept_range_is_not_about_that_concept",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="6-7" -->\n',
            ],
            1,
            "the bell.",
            [False, True],
        ),
        (
            "spans_come_in_reading_order_first",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Arrival" words="4-7, 0-1" -->\n',
            ],
            0,
            "She saw",
            [True],
        ),
        (
            "spans_come_in_reading_order_second",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Arrival" words="4-7, 0-1" -->\n',
            ],
            1,
            "He rang the bell.",
            [True],
        ),
        (
            "spans_starting_together_come_shorter_first",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Seeing" words="0-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Her" words="0-0" -->\n',
            ],
            0,
            "She",
            [True, True],
        ),
        (
            "the_first_story_takes_the_first_concepts",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n',
                '<!-- cell: markdown -->\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Ringing" words="1-3" -->\n',
            ],
            0,
            "the door.",
            [True, False, False],
        ),
        (
            "the_next_story_takes_the_concepts_after_those_of_the_stories_before",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n',
                '<!-- cell: markdown -->\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="2-3" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Ringing" words="1-3" -->\n',
            ],
            2,
            "the bell.",
            [False, True, True],
        ),
        (
            "a_story_without_concepts_takes_none",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n',
                '<!-- cell: markdown -->\n'
                '\n'
                'He rang the bell.\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="2-3" -->\n',
            ],
            0,
            "the bell.",
            [True],
        ),
        (
            "a_concept_without_word_ranges_is_about_no_span",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door.\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n',
            ],
            0,
            "the door.",
            [False, True],
        ),
    ])
    def test_carry_their_text_and_the_concepts_whose_ranges_contain_them(
        self,
        _,
        story_texts: list[str],
        span_idx: int,
        expected_text: str,
        expected_salient_concepts: list[bool],
    ) -> None:
        annotated_stories = [Document(story_text) for story_text in story_texts]

        annotated_story_spans = AnnotatedStorySpansDataset(annotated_stories)

        annotated_story_span = annotated_story_spans[span_idx]
        salient_concepts = annotated_story_span["salient_concepts"].tolist()
        self.assertEqual(annotated_story_span["text"], expected_text)
        self.assertEqual(salient_concepts, expected_salient_concepts)
