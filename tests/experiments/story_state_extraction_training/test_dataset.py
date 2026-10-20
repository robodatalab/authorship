import random
import unittest

from parameterized import parameterized

from experiments.story_state_extraction_training.dataset import (
    SalientConceptExamples,
    SalientConceptsDataset,
)
from server.storydoc.storydoc import Document


class SalientConceptsDatasetTests(unittest.TestCase):
    @parameterized.expand([
        (
            "no_stories",
            [],
            0,
        ),
        (
            "every_concept_with_examples_and_unrelated_texts",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="0-0, 1-1, 2-3, 4-5" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="6-7, 8-10, 11-12" -->\n',
            ],
            2,
        ),
        (
            "a_concept_with_one_example",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="0-0" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="6-7, 8-10" -->\n',
            ],
            2,
        ),
        (
            "a_concept_without_examples_is_left_out",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="6-7, 8-10" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Her" words="0-0" -->\n',
            ],
            2,
        ),
        (
            "a_concept_alone_in_its_story_has_no_unrelated_texts",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="0-0, 1-1" -->\n',
            ],
            0,
        ),
        (
            "the_concepts_of_every_story",
            [
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="0-0, 1-1" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="6-7, 8-10" -->\n',
                '<!-- cell: markdown -->\n'
                '\n'
                'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
                '\n'
                '<!-- cell: salient-concept title="Bell" words="4-5, 6-7" -->\n'
                '\n'
                '<!-- cell: salient-concept title="Door" words="2-3" -->\n',
            ],
            4,
        ),
    ])
    def test_hold_one_item_per_concept_with_examples_and_unrelated_texts(
        self, _, story_texts: list[str], expected_concept_count: int
    ) -> None:
        annotated_stories = [Document(story_text) for story_text in story_texts]

        salient_concepts = SalientConceptsDataset(annotated_stories, random.Random(0))

        self.assertEqual(len(salient_concepts), expected_concept_count)

    @parameterized.expand([
        (
            "all_the_examples_and_the_unrelated_texts_drawn",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
            '\n'
            '<!-- cell: salient-concept title="Door" words="0-0, 1-1, 2-3, 4-5" -->\n'
            '\n'
            'What she saw.\n'
            '\n'
            '<!-- cell: salient-concept title="Bell" words="6-7, 8-10, 11-12" -->\n'
            '\n'
            'What he heard.\n',
            SalientConceptExamples(
                abstract="What she saw.",
                related_examples=["She", "saw", "the door.", "He heard"],
                unrelated_texts=["It rang twice.", "Nobody came.", "the bell."],
            ),
        ),
        (
            "a_text_inside_one_of_the_concepts_ranges_is_not_unrelated_to_it",
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
            '\n'
            '<!-- cell: salient-concept title="Door" words="0-3, 4-5, 6-7, 8-10" -->\n'
            '\n'
            'What she saw.\n'
            '\n'
            '<!-- cell: salient-concept title="Seeing" words="2-3, 11-12" -->\n'
            '\n'
            'Looking.\n',
            SalientConceptExamples(
                abstract="What she saw.",
                related_examples=["She saw the door.", "He heard", "the bell.", "It rang twice."],
                unrelated_texts=["Nobody came."],
            ),
        ),
    ])
    def test_hold_the_concepts_examples_and_a_draw_of_its_unrelated_texts(
        self, _, story_text: str, expected: SalientConceptExamples
    ) -> None:
        annotated_story = Document(story_text)

        salient_concepts = SalientConceptsDataset([annotated_story], random.Random(0))

        self.assertEqual(salient_concepts[0], expected)

    def test_draw_the_unrelated_texts_anew_every_time_a_concept_is_fetched(self) -> None:
        annotated_story = Document(
            '<!-- cell: markdown -->\n'
            '\n'
            'She saw the door. He heard the bell. It rang twice. Nobody came.\n'
            '\n'
            '<!-- cell: salient-concept title="Door" words="0-0, 1-1" -->\n'
            '\n'
            '<!-- cell: salient-concept title="Rest" words="2-2, 3-3, 4-4, 5-5, 6-6, 7-7, 8-8, 9-9, 10-10, 11-11, 12-12" -->\n'
        )
        salient_concepts = SalientConceptsDataset([annotated_story], random.Random(0))

        first_draw = salient_concepts[0]
        second_draw = salient_concepts[0]

        self.assertEqual(
            first_draw.unrelated_texts,
            ["It", "came.", "the", "the", "rang", "heard", "bell.", "He"],
        )
        self.assertEqual(
            second_draw.unrelated_texts,
            ["rang", "bell.", "heard", "He", "came.", "door.", "the", "It"],
        )
