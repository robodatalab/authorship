import asyncio
import unittest
from pathlib import PurePath
from typing import Any
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.story_analysis import fake_story_plots
from server.story_analysis import plots as story_plots
from server.story_analysis.plots import (
    ATTRIBUTING_THE_PASSAGES,
    FINDING_THE_PLOTS,
    PASSES,
    UPDATING_THE_PLOTS,
    StoryPlotsJob,
    identify_story_plots,
)

STORY = storydoc.dumps(
    [
        storydoc.chapter("One"),
        storydoc.Cell(
            storydoc.MARKDOWN,
            "\n\n".join(f"Paragraph {index}" for index in range(24)),
            {"id": "scene"},
        ),
        storydoc.chapter("Two"),
        storydoc.Cell(storydoc.MARKDOWN, "The door stood open.", {"id": "door"}),
    ]
)


def ran(**named: Any) -> None:
    with mock.patch.object(story_plots, "A_TICK_S", 0):
        asyncio.run(identify_story_plots(Document(STORY), **named))


def plots_as_they_were_told() -> list[list[dict[str, Any]]]:
    told: list[list[dict[str, Any]]] = []
    ran(identified=lambda plots, paragraphs: told.append(plots))
    return told


class TheRun(unittest.TestCase):
    def test_says_up_front_how_many_passes_there_are_to_come(self) -> None:
        steps: list[Any] = []

        ran(progress=steps.append)

        planned = steps[: PASSES * 3]
        self.assertEqual(
            [(step.passes, step.doing) for step in planned],
            [
                (passes, doing)
                for passes in range(1, PASSES + 1)
                for doing in (
                    FINDING_THE_PLOTS,
                    ATTRIBUTING_THE_PASSAGES,
                    UPDATING_THE_PLOTS,
                )
            ],
        )
        self.assertFalse(any(step.running for step in planned))

    def test_the_first_chapter_read_already_names_a_plot(self) -> None:
        self.assertEqual(len(plots_as_they_were_told()[0]), 1)

    def test_every_chapter_after_it_adds_a_plot_or_changes_one(self) -> None:
        told = plots_as_they_were_told()

        chapters = len(Document(STORY).chapters)
        while_finding = told[:chapters]
        for before, after in zip(while_finding, while_finding[1:]):
            self.assertNotEqual(before, after)

    def test_attributes_lines_to_the_plots_as_it_reads_the_story(self) -> None:
        attributed: list[int] = []

        ran(identified=lambda plots, paragraphs: attributed.append(len(paragraphs)))

        self.assertEqual(attributed[0], 0)
        self.assertGreater(max(attributed), 0)

    def test_the_plots_gather_what_happened_along_them_pass_by_pass(self) -> None:
        told = plots_as_they_were_told()

        self.assertEqual(len(told[-1][0]["keyEvents"]), PASSES)

    def test_stops_when_it_is_told_to(self) -> None:
        told: list[int] = []
        stop = [False]

        ran(
            cancelled=lambda: stop[0],
            progress=lambda step: stop.__setitem__(0, len(told) > 3),
            identified=lambda plots, paragraphs: told.append(len(plots)),
        )

        self.assertLess(len(told), 10)

    def test_a_document_with_no_prose_is_an_error(self) -> None:
        with self.assertRaises(ValueError):
            with mock.patch.object(story_plots, "A_TICK_S", 0):
                asyncio.run(
                    identify_story_plots(
                        Document(storydoc.dumps([storydoc.chapter("One")]))
                    )
                )


class WhatTheJobSays(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.job = StoryPlotsJob(Document(STORY, PurePath("/stories/story.author")))
        with mock.patch.object(story_plots, "A_TICK_S", 0):
            asyncio.run(self.job.execute())

    def test_works_through_the_steps_of_every_pass(self) -> None:
        self.assertEqual(
            [(step["passes"], step["doing"]) for step in self.job.how_far_along()[:4]],
            [
                (1, FINDING_THE_PLOTS),
                (1, ATTRIBUTING_THE_PASSAGES),
                (1, UPDATING_THE_PLOTS),
                (2, FINDING_THE_PLOTS),
            ],
        )

    def test_names_the_plots_and_where_their_lines_stand_in_their_cells(self) -> None:
        self.assertEqual(
            self.job.story_plots[0]["title"], fake_story_plots.FAKE_STORY_PLOTS[0][0]
        )
        placed = self.job.paragraphs_in_story_plots[0]
        self.assertEqual(placed["cellId"], "scene")
        self.assertEqual(placed["startCharacterOffsetInCell"], 0)
        self.assertEqual(placed["wordsInTheCell"], "Paragraph 0")


if __name__ == "__main__":
    unittest.main()
