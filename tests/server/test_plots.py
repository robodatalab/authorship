import asyncio
import math
import unittest
from typing import Any
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.story_analysis.plots import (
    StoryParagraph,
    StoryPlot,
    StoryPlotKeyEvent,
    one_pass,
    story_paragraphs,
    story_plot_pass_level,
    the_story,
)

PARAGRAPHS = [
    StoryParagraph("scene", at, at + 10, f"Paragraph {at // 10}")
    for at in range(0, 60, 10)
]


def a_story_plot(title: str, **told: Any) -> StoryPlot:
    return StoryPlot(
        title=title,
        characters=told.get("characters", ("Bob", "Alice")),
        origin=told.get("origin", "Bob has a crush on Alice"),
        goal=told.get("goal", "Bob gets a date with Alice"),
        key_events=told.get("key_events", ()),
    )


def build_classifier(*answers: list[float]) -> mock.MagicMock:
    scored = iter(answers)

    async def probabilities(story: str, questions: list[Any]) -> list[float]:
        return list(next(scored))

    classifier = mock.MagicMock()
    classifier.probabilities.side_effect = probabilities
    return classifier


def passed(*arguments: Any, **named: Any) -> Any:
    return asyncio.run(one_pass(*arguments, **named))


def asked_about(classifier: mock.MagicMock, plot: int) -> list[Any]:
    return classifier.probabilities.call_args_list[plot].args[1]


class StoryPlotPassLevel(unittest.TestCase):
    def test_cuts_between_the_paragraphs_that_belong_and_the_ones_that_do_not(
        self,
    ) -> None:
        scores = [0.02, 0.03, 0.05, 0.04, 0.9, 0.95]

        pass_level = story_plot_pass_level(scores)

        self.assertEqual(
            [pass_level.admits(score) for score in scores],
            [False, False, False, False, True, True],
        )

    def test_a_plot_scored_low_everywhere_claims_nothing(self) -> None:
        scores = [0.01, 0.02, 0.2, 0.3]

        pass_level = story_plot_pass_level(scores)

        self.assertFalse(any(pass_level.admits(score) for score in scores))

    def test_two_clear_masses_are_better_separated_than_one_spread_out(
        self,
    ) -> None:
        two_masses = story_plot_pass_level([0.02, 0.03, 0.04, 0.05, 0.9, 0.95])
        one_mass = story_plot_pass_level([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])

        self.assertGreater(two_masses.separation, 2 * one_mass.separation)

    def test_a_plot_every_paragraph_scores_the_same_on_claims_nothing(
        self,
    ) -> None:
        pass_level = story_plot_pass_level([0.7] * 5)

        self.assertFalse(pass_level.admits(0.7))
        self.assertEqual(pass_level.separation, 0.0)
        self.assertEqual(pass_level.log_odds, math.inf)


class ParagraphsOfTheStory(unittest.TestCase):
    def test_are_the_prose_cells_broken_on_blank_lines(self) -> None:
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("The First Night"),
                    storydoc.markdown(
                        "The lantern had gone out.\n\nShe did not light it."
                    ),
                    storydoc.Cell(storydoc.NOTE, "Ask Mara about this", {}),
                ]
            )
        )

        paragraphs = story_paragraphs(document)

        self.assertEqual(
            [paragraph.words for paragraph in paragraphs],
            ["The lantern had gone out.", "She did not light it."],
        )
        self.assertEqual([paragraph.at for paragraph in paragraphs], [0, 27])

    def test_the_story_marks_the_paragraphs_a_plot_already_claims(self) -> None:
        story = the_story(PARAGRAPHS[:3], in_a_plot={1})

        self.assertEqual(
            story, "Paragraph 0\n\n[in a plot] Paragraph 1\n\nParagraph 2"
        )


class OnePass(unittest.TestCase):
    def test_a_plot_claims_the_paragraphs_above_its_own_pass_level(self) -> None:
        claims = passed(
            build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95]),
            "the story",
            PARAGRAPHS,
            [a_story_plot("The crush")],
        )

        self.assertEqual([claim.paragraphs for claim in claims], [frozenset({4, 5})])

    def test_a_plot_the_story_scores_low_everywhere_is_dropped(self) -> None:
        claims = passed(
            build_classifier([0.01, 0.02, 0.2, 0.3, 0.1, 0.05]),
            "the story",
            PARAGRAPHS,
            [a_story_plot("The crush")],
        )

        self.assertEqual(claims, [])

    def test_a_plot_the_story_never_tells_apart_is_dropped(self) -> None:
        claims = passed(
            build_classifier([0.5, 0.6, 0.65, 0.7, 0.75, 0.8]),
            "the story",
            PARAGRAPHS,
            [a_story_plot("The crush")],
        )

        self.assertEqual(claims, [])

    def test_a_paragraph_is_scored_without_the_events_it_gave_the_plot(self) -> None:
        classifier = build_classifier([0.02, 0.9, 0.95, 0.03, 0.04, 0.05])

        passed(
            classifier,
            "the story",
            PARAGRAPHS,
            [
                a_story_plot(
                    "The crush",
                    key_events=(StoryPlotKeyEvent("Bob approached Alice", 1),),
                )
            ],
        )

        questions = asked_about(classifier, 0)
        self.assertIn("Bob approached Alice", questions[0].plot)
        self.assertNotIn("Bob approached Alice", questions[1].plot)

    def test_two_plots_claiming_the_same_paragraphs_become_one(self) -> None:
        claims = passed(
            build_classifier(
                [0.02, 0.03, 0.05, 0.04, 0.9, 0.95],
                [0.2, 0.1, 0.15, 0.3, 0.8, 0.85],
            ),
            "the story",
            PARAGRAPHS,
            [
                a_story_plot("The crush", characters=("Bob", "Alice")),
                a_story_plot(
                    "Alice is asked out",
                    characters=("Alice", "Mara"),
                    key_events=(StoryPlotKeyEvent("Bob asked Alice out", 4),),
                ),
            ],
        )

        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0].plot.title, "The crush")
        self.assertEqual(claims[0].plot.characters, ("Bob", "Alice", "Mara"))
        self.assertEqual(
            [event.what_happened for event in claims[0].plot.key_events],
            ["Bob asked Alice out"],
        )
        self.assertEqual(claims[0].paragraphs, frozenset({4, 5}))

    def test_a_cancelled_pass_stops_scoring(self) -> None:
        classifier = build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95])

        claims = passed(
            classifier,
            "the story",
            PARAGRAPHS,
            [a_story_plot("The crush"), a_story_plot("The rivalry")],
            lambda: classifier.probabilities.call_count > 0,
        )

        self.assertEqual(claims, [])
        self.assertEqual(classifier.probabilities.call_count, 1)


if __name__ == "__main__":
    unittest.main()
