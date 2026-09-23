import asyncio
import itertools
import math
import unittest
from collections.abc import AsyncIterator
from pathlib import PurePath
from typing import Any
from unittest import mock

import httpx
from cortexgrid_infer import CompletionChunk
from tenacity import wait_none

from server import storydoc
from server.storydoc import Document
from server.story_analysis.plots import StoryPlotsJob
from server.story_analysis import plots as story_plots
from server.story_analysis.plots import (
    ATTRIBUTING_THE_PASSAGES,
    FINDING_THE_PLOTS,
    PARAGRAPHS_READ_FOR_KEY_EVENTS,
    UPDATING_THE_PLOTS,
    MOST_PLOTS_A_STORY_HAS,
    STORY_PLOTS_TOKENS,
    STORY_PLOT_KEY_EVENTS_INSTRUCTION,
    THINKING_HEADROOM,
    UNCLAIMED_PLOTS_REQUEST,
    StoryParagraph,
    StoryPlot,
    StoryPlotKeyEvent,
    identify_story_plots,
    one_pass,
    story_paragraphs,
    story_plot_key_events,
    story_plot_pass_level,
    story_plots_in_the_chapters,
    story_plots_in_what_no_plot_claims,
    story_plots_pooled,
    the_story,
)

PARAGRAPHS = [
    StoryParagraph("scene", at, at + 10, f"Paragraph {at // 10}")
    for at in range(0, 60, 10)
]


PARAGRAPHS_OF_A_LONG_PLOT = [
    StoryParagraph("scene", at * 10, at * 10 + 10, f"Paragraph {at}")
    for at in range(PARAGRAPHS_READ_FOR_KEY_EVENTS + 1)
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
    scored = itertools.cycle(answers)

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

ANOTHER_PLOT = """[
    {
        "title": "The rivalry",
        "characters": ["Bob", "Mara"],
        "origin": "Mara wants what Bob has",
        "goal": "one of them leaves"
    }
]"""

STORY = storydoc.dumps(
    [
        storydoc.chapter("One"),
        storydoc.Cell(
            storydoc.MARKDOWN,
            "\n\n".join(f"Paragraph {index}" for index in range(6)),
            {"id": "scene"},
        ),
    ]
)


def build_discovery_model(
    chapters: str = A_CHAPTER_PLOT,
    key_events: str = "[]",
    unclaimed: str = "[]",
) -> mock.MagicMock:
    def answer(messages: list[dict[str, str]], **_: Any) -> AsyncIterator[Any]:
        if messages[0]["content"] == STORY_PLOT_KEY_EVENTS_INSTRUCTION:
            return streamed(key_events)
        if UNCLAIMED_PLOTS_REQUEST in messages[1]["content"]:
            return streamed(unclaimed)
        return streamed(chapters)

    model = mock.MagicMock()
    model.complete.side_effect = answer
    return model


def ran(*arguments: Any, **named: Any) -> None:
    asyncio.run(identify_story_plots(*arguments, **named))


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

    def test_the_json_is_read_out_of_whatever_the_model_says_around_it(self) -> None:
        model = build_model(
            f"Here are the plots I found.\n\n```json\n{A_CHAPTER_PLOT}\n```\n\n"
            "Let me know if you would like more."
        )
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("The First Night"),
                    storydoc.markdown("The lantern had gone out."),
                ]
            )
        )

        self.assertEqual(
            [plot.title for plot in discovered(model, document)], ["The crush"]
        )

    def test_a_dropped_connection_is_asked_again(self) -> None:
        self.addCleanup(
            setattr,
            story_plots._answered.retry,
            "wait",
            story_plots._answered.retry.wait,
        )
        story_plots._answered.retry.wait = wait_none()
        answers = iter([A_CHAPTER_PLOT])

        def answer(messages: list[dict[str, str]], **_: Any) -> Any:
            if model.complete.call_count == 1:
                raise httpx.RemoteProtocolError("peer closed connection")
            return streamed(next(answers))

        model = mock.MagicMock()
        model.complete.side_effect = answer
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
        self.assertEqual(model.complete.call_count, 2)

    def test_an_answer_with_no_json_in_it_says_what_came_back(self) -> None:
        model = build_model("I would rather not.")
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("The First Night"),
                    storydoc.markdown("The lantern had gone out."),
                ]
            )
        )

        with self.assertRaises(ValueError) as refused:
            discovered(model, document)

        self.assertIn("I would rather not.", str(refused.exception))

    def test_the_model_is_left_room_to_think_before_it_answers(self) -> None:
        model = build_model(A_CHAPTER_PLOT)
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("The First Night"),
                    storydoc.markdown("The lantern had gone out."),
                ]
            )
        )

        discovered(model, document)

        self.assertEqual(
            model.complete.call_args.kwargs["max_new_tokens"],
            STORY_PLOTS_TOKENS + THINKING_HEADROOM,
        )

    def test_cancelling_leaves_the_chapters_that_were_not_read(self) -> None:
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

        self.assertEqual([plot.title for plot in plots], ["The crush"])
        self.assertEqual(model.complete.call_count, 1)

    def test_the_chapters_are_read_side_by_side(self) -> None:
        model = build_model(*[A_CHAPTER_PLOT] * 3)
        document = Document(
            storydoc.dumps(
                [
                    storydoc.chapter("One"),
                    storydoc.markdown("The lantern had gone out."),
                    storydoc.chapter("Two"),
                    storydoc.markdown("The door stood open."),
                    storydoc.chapter("Three"),
                    storydoc.markdown("Nobody came."),
                ]
            )
        )
        read: list[tuple[int, int]] = []

        plots = discovered(
            model,
            document,
            read=lambda chapters_read, chapters: read.append(
                (chapters_read, chapters)
            ),
        )

        self.assertEqual(len(plots), 3)
        self.assertEqual(read, [(0, 3), (1, 3), (2, 3), (3, 3)])

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


class PoolingTheStoryPlots(unittest.TestCase):
    def test_a_story_proposed_more_threads_than_it_can_have_is_pooled(
        self,
    ) -> None:
        model = build_model(A_CHAPTER_PLOT)
        proposed = [
            a_story_plot(f"The crush, said again {again}")
            for again in range(MOST_PLOTS_A_STORY_HAS + 2)
        ]

        pooled = asyncio.run(
            story_plots_pooled(model, proposed, MOST_PLOTS_A_STORY_HAS)
        )

        self.assertEqual([plot.title for plot in pooled], ["The crush"])
        self.assertIn("The crush, said again 11", read_by(model))
        self.assertIn(f"at most {MOST_PLOTS_A_STORY_HAS} plots", read_by(model))

    def test_a_story_within_its_threads_is_left_as_it_was_proposed(self) -> None:
        model = build_model(A_CHAPTER_PLOT)
        proposed = [a_story_plot("The crush"), a_story_plot("The rivalry")]

        pooled = asyncio.run(story_plots_pooled(model, proposed, 2))

        self.assertEqual(pooled, proposed)
        model.complete.assert_not_called()

    def test_no_room_for_another_plot_asks_for_none(self) -> None:
        model = build_model(A_CHAPTER_PLOT)

        pooled = asyncio.run(story_plots_pooled(model, [a_story_plot("One")], 0))

        self.assertEqual(pooled, [])
        model.complete.assert_not_called()


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

    def test_are_read_a_batch_of_paragraphs_at_a_time(self) -> None:
        last = PARAGRAPHS_READ_FOR_KEY_EVENTS
        model = build_model(
            '[{"paragraph": 0, "what_happened": "Bob approached Alice"}]',
            f'[{{"paragraph": {last}, "what_happened": "Bob asked Alice out"}}]',
        )

        events = asyncio.run(
            story_plot_key_events(
                model,
                a_story_plot("The crush"),
                PARAGRAPHS_OF_A_LONG_PLOT,
                set(range(last + 1)),
            )
        )

        self.assertEqual(model.complete.call_count, 2)
        self.assertEqual([event.found_in for event in events], [0, last])
        self.assertNotIn(f"{last}. Paragraph {last}", read_by(model, 0))

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


class TheStepsAJobSays(unittest.TestCase):
    def build_job(self, classifier: mock.MagicMock) -> StoryPlotsJob:
        return StoryPlotsJob(
            build_discovery_model(),
            classifier,
            Document(STORY, PurePath("/stories/story.author")),
        )

    def test_names_every_step_of_the_run_in_the_order_it_was_worked_on(self) -> None:
        job = self.build_job(build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95]))

        asyncio.run(job.execute())

        self.assertEqual(
            [(step["passes"], step["doing"]) for step in job.how_far_along()][:4],
            [
                (1, FINDING_THE_PLOTS),
                (1, ATTRIBUTING_THE_PASSAGES),
                (1, UPDATING_THE_PLOTS),
                (2, FINDING_THE_PLOTS),
            ],
        )
        self.assertTrue(
            all(step["state"] == "done" for step in job.how_far_along()),
            job.how_far_along(),
        )

    def test_says_what_is_running_and_what_is_still_to_come(self) -> None:
        seen: list[list[dict[str, Any]]] = []
        classifier = mock.MagicMock()

        async def probabilities(story: str, questions: list[Any]) -> list[float]:
            seen.append(job.how_far_along())
            return [0.02, 0.03, 0.05, 0.04, 0.9, 0.95]

        classifier.probabilities.side_effect = probabilities
        job = self.build_job(classifier)

        asyncio.run(job.execute())

        self.assertEqual(
            [(step["doing"], step["state"], step["of"]) for step in seen[0]],
            [
                (FINDING_THE_PLOTS, "done", 1),
                (ATTRIBUTING_THE_PASSAGES, "running", 6),
                (UPDATING_THE_PLOTS, "waiting", 1),
            ],
        )

    def test_times_every_step_it_has_worked_on(self) -> None:
        job = self.build_job(build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95]))

        asyncio.run(job.execute())

        self.assertTrue(
            all(step["seconds"] >= 0 for step in job.how_far_along()),
            job.how_far_along(),
        )


class IdentifyingTheStoryPlots(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.identified: list[tuple[list[Any], list[Any]]] = []

    def test_hands_over_the_plots_and_the_paragraphs_in_them(self) -> None:
        classifier = build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95])

        ran(
            build_discovery_model(),
            classifier,
            Document(STORY),
            identified=lambda plots, paragraphs: self.identified.append(
                (plots, paragraphs)
            ),
        )

        plots, paragraphs = self.identified[-1]
        self.assertEqual([plot["title"] for plot in plots], ["The crush"])
        self.assertEqual(plots[0]["origin"], "Bob has a crush on Alice")
        self.assertEqual(plots[0]["characters"], ["Bob", "Alice"])
        self.assertEqual(plots[0]["keyEvents"], [])
        self.assertEqual(
            paragraphs,
            [
                {
                    "cellId": "scene",
                    "startCharacterOffsetInCell": 52,
                    "endCharacterOffsetInCell": 63,
                    "wordsInTheCell": "Paragraph 4",
                    "isVisible": True,
                    "storyPlotIndices": [0],
                },
                {
                    "cellId": "scene",
                    "startCharacterOffsetInCell": 65,
                    "endCharacterOffsetInCell": 76,
                    "wordsInTheCell": "Paragraph 5",
                    "isVisible": True,
                    "storyPlotIndices": [0],
                },
            ],
        )

    def test_passes_until_the_assignments_stop_changing(self) -> None:
        classifier = build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95])

        ran(build_discovery_model(), classifier, Document(STORY))

        self.assertEqual(classifier.probabilities.call_count, 4)

    def test_gives_up_on_a_story_that_never_settles(self) -> None:
        classifier = build_classifier(
            [0.02, 0.03, 0.05, 0.04, 0.9, 0.95],
            [0.9, 0.95, 0.05, 0.04, 0.02, 0.03],
        )

        ran(build_discovery_model(), classifier, Document(STORY))

        self.assertEqual(classifier.probabilities.call_count, 10)

    def test_a_plot_found_in_what_no_plot_claimed_is_scored_in_the_next_pass(
        self,
    ) -> None:
        classifier = build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95])

        ran(
            build_discovery_model(unclaimed=ANOTHER_PLOT),
            classifier,
            Document(STORY),
        )

        self.assertEqual(
            [
                asked_about(classifier, scored)[0].plot.splitlines()[0]
                for scored in range(3)
            ],
            ["The crush", "The crush", "The rivalry"],
        )

    def test_the_key_events_a_pass_found_are_told_to_the_next_one(self) -> None:
        classifier = build_classifier([0.02, 0.03, 0.05, 0.04, 0.9, 0.95])

        ran(
            build_discovery_model(
                key_events='[{"paragraph": 4, "what_happened": "Bob asked Alice out"}]'
            ),
            classifier,
            Document(STORY),
        )

        first, second = asked_about(classifier, 0), asked_about(classifier, 1)
        self.assertNotIn("Bob asked Alice out", first[5].plot)
        self.assertIn("Bob asked Alice out", second[5].plot)
        self.assertNotIn("Bob asked Alice out", second[4].plot)

    def test_a_document_with_no_prose_is_an_error(self) -> None:
        with self.assertRaises(ValueError):
            ran(
                build_discovery_model(),
                build_classifier([]),
                Document(storydoc.dumps([storydoc.chapter("One")])),
            )


if __name__ == "__main__":
    unittest.main()
