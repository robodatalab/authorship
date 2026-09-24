import unittest
from dataclasses import replace
from unittest import mock

from parameterized import parameterized
from server.storydoc import Document
from server.story_analysis import plots
from server.story_analysis.plots import (
    StoryPlot,
    identify_story_plot_pass,
    similarity_of_events,
    stitch_events_into_plots,
)


class SimilarityOfEventsTests(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.enterContext(
            mock.patch.object(
                plots,
                "similarity_of_text",
                side_effect=lambda lhs_text, rhs_text: float(lhs_text == rhs_text),
            )
        )

    @parameterized.expand([
        ([], []),
        (["1",], ["1"]),
        (["1", "2"], ["2", "1"]),
    ])
    def test_obviously_similar_events(self, lhs_events, rhs_events) -> None:
        result = similarity_of_events(lhs_events, rhs_events)
        self.assertGreaterEqual(result, 0.99)

    @parameterized.expand([
            (["1", "2", "3", "4", "5", "6"], ["1", "2", "4", "5", "6", "7"]),
            (["1", "2", "3", "4", "5", "6"], ["2", "4", "1", "6", "7", "5"]),
        ])
    def test_few_differences_change_similarity_only_little(self, lhs_events, rhs_events) -> None:
        result = similarity_of_events(lhs_events, rhs_events)
        self.assertGreaterEqual(result, 0.9)
        self.assertLess(result, 0.99)

    @parameterized.expand([
                (["1", "2", "3", "4", "5", "6"], []),
                (["1", "2", "3", "4", "5", "6"], ["1"]),
                (["1", "2", "3", "4", "5", "6"], ["6", "7", "5"]),
                (["1", "2", "3", "4", "5", "6"], ["9", "10", "11", "12", "13", "14"]),
            ])
    def test_many_differences_greatly_affect_similarity(self, lhs_events, rhs_events) -> None:
        result = similarity_of_events(lhs_events, rhs_events)
        self.assertLess(result, 0.9)


class StitchEventsIntoPlotsTests(unittest.TestCase):
    @parameterized.expand([
        (
            [],
            [],
            [],
        ),
        (
            ["A1"],
            [[1.0]],
            [["A1"]],
        ),
        (
            ["A1", "A2", "A3"],
            [
                [1.0, 0.9, 0.8],
                [0.9, 1.0, 0.7],
                [0.8, 0.7, 1.0],
            ],
            [["A1", "A2", "A3"]],
        ),
        (
            ["A1", "B1", "A2", "B2"],
            [
                [1.0, 0.1, 0.9, 0.2],
                [0.1, 1.0, 0.2, 0.8],
                [0.9, 0.2, 1.0, 0.1],
                [0.2, 0.8, 0.1, 1.0],
            ],
            [["A1", "A2"], ["B1", "B2"]],
        ),
        (
            ["A1", "B1", "C1"],
            [
                [1.0, 0.2, 0.1],
                [0.2, 1.0, 0.3],
                [0.1, 0.3, 1.0],
            ],
            [["A1"], ["B1"], ["C1"]],
        ),
        (
            ["A1", "A2", "B1", "B2"],
            [
                [1.0, 0.9, 0.1, 0.1],
                [0.9, 1.0, 0.9, 0.1],
                [0.1, 0.9, 1.0, 0.9],
                [0.1, 0.1, 0.9, 1.0],
            ],
            [["A1", "A2"], ["B1", "B2"]],
        ),
    ])
    def test_stitches_the_events_of_each_plot_together(
        self, events, share_a_plot, expected_plots
    ) -> None:
        result = stitch_events_into_plots(events, share_a_plot)
        self.assertEqual(result, expected_plots)




if __name__ == "__main__":
    unittest.main()
