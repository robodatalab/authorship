import unittest
from dataclasses import replace
from unittest import mock

from parameterized import parameterized
from server.storydoc import Document
from server.story_analysis import plots
from server.story_analysis.plots import (
    StoryEvent,
    StoryPlot,
    stitch_events_into_causal_trajectory,
)


class StitchEventsIntoCausalTrajectoryTests(unittest.IsolatedAsyncioTestCase):
    @parameterized.expand([
        (
            [],
            [],
            [],
            [
                StoryPlot(title="Same situation", characters=[], origin="", goal="", key_events=[]),
            ],
        ),
        (
            [StoryEvent("A1", 0), StoryEvent("A2", 1), StoryEvent("A3", 2)],
            [0.8, 0.75],
            [],
            [
                StoryPlot(title="", characters=[], origin="", goal="", key_events=["A1", "A2", "A3"]),
                StoryPlot(
                    title="Same situation",
                    characters=[],
                    origin="",
                    goal="",
                    key_events=["0.80  A1 → A2", "0.75  A2 → A3"],
                ),
            ],
        ),
        (
            [
                StoryEvent("A1", 0),
                StoryEvent("A2", 1),
                StoryEvent("B1", 2),
                StoryEvent("B2", 3),
                StoryEvent("A3", 4),
                StoryEvent("B3", 5),
            ],
            [0.8, 0.45, 0.75, 0.5, 0.4],
            [0.45, 0.85, 0.45, 0.45, 0.45, 0.8, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45],
            [
                StoryPlot(title="", characters=[], origin="", goal="", key_events=["A1", "A2", "A3"]),
                StoryPlot(title="", characters=[], origin="", goal="", key_events=["B1", "B2", "B3"]),
                StoryPlot(
                    title="Same situation",
                    characters=[],
                    origin="",
                    goal="",
                    key_events=[
                        "0.80  A1 → A2",
                        "0.45  A2 → B1",
                        "0.75  B1 → B2",
                        "0.50  B2 → A3",
                        "0.40  A3 → B3",
                        "0.45  A2 → B1",
                        "0.85  A2 → A3",
                        "0.45  A2 → B3",
                        "0.45  B2 → A1",
                        "0.45  B2 → A3",
                        "0.80  B2 → B3",
                        "0.45  A3 → A1",
                        "0.45  A3 → B1",
                        "0.45  A3 → B3",
                        "0.45  B3 → A1",
                        "0.45  B3 → B1",
                        "0.45  B3 → A3",
                    ],
                ),
            ],
        ),
        (
            [
                StoryEvent("C1", 0),
                StoryEvent("C2", 1),
                StoryEvent("B1", 2),
                StoryEvent("B2", 3),
                StoryEvent("A1", 4),
                StoryEvent("A2", 5),
            ],
            [0.75, 0.45, 0.75, 0.45, 0.75],
            [0.45, 0.6, 0.8, 0.45, 0.45, 0.85],
            [
                StoryPlot(title="", characters=[], origin="", goal="", key_events=["A1", "A2", "B1", "B2", "C1", "C2"]),
                StoryPlot(
                    title="Same situation",
                    characters=[],
                    origin="",
                    goal="",
                    key_events=[
                        "0.75  C1 → C2",
                        "0.45  C2 → B1",
                        "0.75  B1 → B2",
                        "0.45  B2 → A1",
                        "0.75  A1 → A2",
                        "0.45  C2 → B1",
                        "0.60  C2 → A1",
                        "0.80  B2 → C1",
                        "0.45  B2 → A1",
                        "0.45  A2 → C1",
                        "0.85  A2 → B1",
                    ],
                ),
            ],
        ),
    ])
    async def test_stitches_the_events_of_each_plot_in_causal_order(
        self, events, same_situation_as_previous, same_situation_across_runs, expected_plots
    ) -> None:
        causal_event_trajectory_classifier = mock.MagicMock()
        causal_event_trajectory_classifier.same_situation_probabilities.side_effect = [
            mock.MagicMock(**{"__aiter__.return_value": same_situation_as_previous}),
            mock.MagicMock(**{"__aiter__.return_value": same_situation_across_runs}),
        ]

        result = await stitch_events_into_causal_trajectory(
            events, "The story.", causal_event_trajectory_classifier
        )

        self.assertEqual(result, expected_plots)

    async def test_asks_about_consecutive_events_then_about_the_ends_and_starts_of_runs(
        self,
    ) -> None:
        causal_event_trajectory_classifier = mock.MagicMock()
        causal_event_trajectory_classifier.same_situation_probabilities.side_effect = [
            mock.MagicMock(**{"__aiter__.return_value": [0.75, 0.45, 0.75, 0.45, 0.75]}),
            mock.MagicMock(**{"__aiter__.return_value": [0.45, 0.6, 0.8, 0.45, 0.45, 0.85]}),
        ]

        await stitch_events_into_causal_trajectory(
            [
                StoryEvent("C1", 0),
                StoryEvent("C2", 1),
                StoryEvent("B1", 2),
                StoryEvent("B2", 3),
                StoryEvent("A1", 4),
                StoryEvent("A2", 5),
            ],
            "The story.",
            causal_event_trajectory_classifier,
        )

        self.assertEqual(
            causal_event_trajectory_classifier.same_situation_probabilities.call_args_list,
            [
                mock.call(
                    "The story.",
                    [("C1", "C2"), ("C2", "B1"), ("B1", "B2"), ("B2", "A1"), ("A1", "A2")],
                ),
                mock.call(
                    "The story.",
                    [("C2", "B1"), ("C2", "A1"), ("B2", "C1"), ("B2", "A1"), ("A2", "C1"), ("A2", "B1")],
                ),
            ],
        )


if __name__ == "__main__":
    unittest.main()
