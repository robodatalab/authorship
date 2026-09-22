import asyncio
import itertools
import math
import unittest
from collections.abc import AsyncIterator
from typing import Any
from unittest import mock

from cortexgrid_infer import CompletionChunk

from server import storydoc
from server.storydoc import Document
from server.story_analysis.plots import (
    StoryParagraph,
    StoryPlot,
    StoryPlotKeyEvent,
    one_pass,
    story_paragraphs,
    story_plot_key_events,
    story_plot_pass_level,
    story_plots_in_the_chapters,
    story_plots_in_what_no_plot_claims,
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


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


def build_model(*replies: str) -> mock.MagicMock:
    answers = iter(replies) if replies else itertools.repeat("[]")
    model = mock.MagicMock()
    model.complete.side_effect = lambda messages, **_: streamed(next(answers))
    return model


def read_by(model: mock.MagicMock, turn: int = 0) -> str:
    return str(model.complete.call_args_list[turn].args[0][1]["content"])


def discovered(*arguments: Any, **named: Any) -> Any:
    return asyncio.run(story_plots_in_the_chapters(*arguments, **named))


A_CHAPTER_PLOT = """[
    {
        "title": "The crush",
        "characters": ["Bob", "Alice"],
        "origin": "Bob has a crush on Alice",
        "goal": "Bob gets a date with Alice"
    }
]"""


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


class DiscoveringTheStoryPlots(unittest.TestCase):
    def test_each_chapter_is_read_for_the_plot_it_turns_on(self) -> None:
        model = build_model(A_CHAPTER_PLOT, A_CHAPTER_PLOT)
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("The First Night"),
                    storydoc.markdown("The lantern had gone out."),
                    storydoc.chapter("The Second"),
                    storydoc.markdown("The door stood open."),
                ]
            )
        )

        plots = discovered(model, document)

        self.assertEqual(model.complete.call_count, 2)
        self.assertIn("The lantern had gone out.", read_by(model, 0))
        self.assertNotIn("The door stood open.", read_by(model, 0))
        self.assertEqual([plot.title for plot in plots], ["The crush", "The crush"])
        self.assertEqual(plots[0].characters, ("Bob", "Alice"))

    def test_a_fenced_answer_is_read_as_the_json_it_holds(self) -> None:
        model = build_model(f"```json\n{A_CHAPTER_PLOT}\n```")
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("The First Night"),
                    storydoc.markdown("The lantern had gone out."),
                ]
            )
        )

        plots = discovered(model, document)

        self.assertEqual([plot.title for plot in plots], ["The crush"])

    def test_cancelling_stops_before_the_next_chapter_is_read(self) -> None:
        model = build_model(A_CHAPTER_PLOT, A_CHAPTER_PLOT)
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("The First Night"),
                    storydoc.markdown("The lantern had gone out."),
                    storydoc.chapter("The Second"),
                    storydoc.markdown("The door stood open."),
                ]
            )
        )

        plots = discovered(model, document, lambda: model.complete.call_count > 0)

        self.assertEqual(plots, [])
        self.assertEqual(model.complete.call_count, 1)

    def test_what_no_plot_claims_is_read_with_the_claimed_paragraphs_marked(
        self,
    ) -> None:
        model = build_model(A_CHAPTER_PLOT)

        plots = asyncio.run(
            story_plots_in_what_no_plot_claims(model, PARAGRAPHS[:3], {0, 2})
        )

        self.assertIn(
            "[in a plot] Paragraph 0\n\nParagraph 1\n\n[in a plot] Paragraph 2",
            read_by(model),
        )
        self.assertEqual([plot.title for plot in plots], ["The crush"])


class KeyEventsOfAStoryPlot(unittest.TestCase):
    def test_are_read_from_the_paragraphs_the_plot_claims(self) -> None:
        model = build_model(
            """[
                {"paragraph": 1, "what_happened": "Bob approached Alice"},
                {"paragraph": 4, "what_happened": "Bob asked Alice out"}
            ]"""
        )

        events = asyncio.run(
            story_plot_key_events(
                model, a_story_plot("The crush"), PARAGRAPHS, {1, 4}
            )
        )

        self.assertEqual(
            events,
            (
                StoryPlotKeyEvent("Bob approached Alice", 1),
                StoryPlotKeyEvent("Bob asked Alice out", 4),
            ),
        )
        self.assertIn("1. Paragraph 1\n\n4. Paragraph 4", read_by(model))

    def test_an_event_put_in_a_paragraph_the_plot_does_not_claim_is_dropped(
        self,
    ) -> None:
        model = build_model(
            """[
                {"paragraph": 1, "what_happened": "Bob approached Alice"},
                {"paragraph": 3, "what_happened": "Alice left town"}
            ]"""
        )

        events = asyncio.run(
            story_plot_key_events(model, a_story_plot("The crush"), PARAGRAPHS, {1, 4})
        )

        self.assertEqual(events, (StoryPlotKeyEvent("Bob approached Alice", 1),))


if __name__ == "__main__":
    unittest.main()
