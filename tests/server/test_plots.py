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
            [],
        ),
        (
            [StoryEvent("A1", 0), StoryEvent("A2", 1), StoryEvent("A3", 2)],
            [0.6, 0.5],
            [],
            [StoryPlot(title="", characters=[], origin="", goal="", key_events=["A1", "A2", "A3"])],
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
            [0.6, -0.1, 0.5, 0.0, -0.2],
            [-0.1, 0.7, -0.1, -0.1, -0.1, 0.6, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1],
            [
                StoryPlot(title="", characters=[], origin="", goal="", key_events=["A1", "A2", "A3"]),
                StoryPlot(title="", characters=[], origin="", goal="", key_events=["B1", "B2", "B3"]),
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
            [0.5, -0.1, 0.5, -0.1, 0.5],
            [-0.1, 0.2, 0.6, -0.1, -0.1, 0.7],
            [
                StoryPlot(title="", characters=[], origin="", goal="", key_events=["A1", "A2", "B1", "B2", "C1", "C2"]),
            ],
        ),
    ])
    async def test_stitches_the_events_of_each_plot_in_causal_order(
        self, events, effects_on_next_event, effects_between_runs, expected_plots
    ) -> None:
        causal_event_trajectory_classifier = mock.MagicMock()
        causal_event_trajectory_classifier.causal_effects.side_effect = [
            mock.MagicMock(**{"__aiter__.return_value": effects_on_next_event}),
            mock.MagicMock(**{"__aiter__.return_value": effects_between_runs}),
        ]

        result = await stitch_events_into_causal_trajectory(
            events, "The story.", causal_event_trajectory_classifier
        )

        self.assertEqual(result, expected_plots)

    async def test_asks_about_consecutive_events_then_about_the_ends_and_starts_of_runs(
        self,
    ) -> None:
        causal_event_trajectory_classifier = mock.MagicMock()
        causal_event_trajectory_classifier.causal_effects.side_effect = [
            mock.MagicMock(**{"__aiter__.return_value": [0.5, -0.1, 0.5, -0.1, 0.5]}),
            mock.MagicMock(**{"__aiter__.return_value": [-0.1, 0.2, 0.6, -0.1, -0.1, 0.7]}),
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
            causal_event_trajectory_classifier.causal_effects.call_args_list,
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
