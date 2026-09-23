import asyncio
import unittest
from pathlib import PurePath
from typing import Any
from unittest import mock

from server import storydoc
from server.storydoc import Document
from server.story_analysis import plots as story_plots
from server.story_analysis.plots import (
    ATTRIBUTING_THE_PASSAGES,
    FINDING_THE_PLOTS,
    UPDATING_THE_PLOTS,
    StoryPlotsJob,
    identify_story_plots,
    story_paragraphs,
    story_plot_indices,
)

STORY = storydoc.dumps(
    [
        storydoc.chapter("One"),
        storydoc.Cell(
            storydoc.MARKDOWN,
            "\n\n".join(f"Paragraph {index}" for index in range(24)),
            {"id": "scene"},
        ),
    ]
)


def ran(*arguments: Any, **named: Any) -> None:
    with mock.patch.object(story_plots, "A_TICK_S", 0):
        asyncio.run(identify_story_plots(*arguments, **named))


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

    def test_a_paragraph_belongs_to_the_plots_the_beat_gives_it(self) -> None:
        self.assertEqual(story_plot_indices(0, 6), [0])
        self.assertEqual(story_plot_indices(5, 6), [0, 1])
        self.assertEqual(story_plot_indices(11, 6), [])
        self.assertEqual(story_plot_indices(12, 6), [1])
        self.assertEqual(story_plot_indices(0, 0), [])


class TheFakeRun(unittest.TestCase):
    def build_job(self) -> StoryPlotsJob:
        return StoryPlotsJob(
            mock.MagicMock(),
            mock.MagicMock(),
            Document(STORY, PurePath("/stories/story.author")),
        )

    def test_names_a_plot_at_a_time_before_it_attributes_anything(self) -> None:
        identified: list[tuple[int, int]] = []

        ran(
            mock.MagicMock(),
            mock.MagicMock(),
            Document(STORY),
            identified=lambda plots, paragraphs: identified.append(
                (len(plots), len(paragraphs))
            ),
        )

        named = [plots for plots, _ in identified[:12]]
        self.assertEqual(named, sorted(named))
        self.assertEqual(named[-1], len(story_plots.FAKE_STORY_PLOTS))
        self.assertTrue(all(paragraphs == 0 for _, paragraphs in identified[:12]))

    def test_attributes_more_paragraphs_as_a_pass_goes_on(self) -> None:
        identified: list[int] = []

        ran(
            mock.MagicMock(),
            mock.MagicMock(),
            Document(STORY),
            identified=lambda plots, paragraphs: identified.append(len(paragraphs)),
        )

        in_the_first_pass = identified[: identified.index(0, 1) or None]
        self.assertEqual(sorted(in_the_first_pass), in_the_first_pass)
        self.assertGreater(max(identified), 0)

    def test_works_through_the_steps_of_every_pass(self) -> None:
        job = self.build_job()

        with mock.patch.object(story_plots, "A_TICK_S", 0):
            asyncio.run(job.execute())

        self.assertEqual(
            [(step["passes"], step["doing"]) for step in job.how_far_along()],
            [
                (1, FINDING_THE_PLOTS),
                (1, ATTRIBUTING_THE_PASSAGES),
                (1, UPDATING_THE_PLOTS),
                (2, FINDING_THE_PLOTS),
                (2, ATTRIBUTING_THE_PASSAGES),
                (2, UPDATING_THE_PLOTS),
                (3, FINDING_THE_PLOTS),
                (3, ATTRIBUTING_THE_PASSAGES),
                (3, UPDATING_THE_PLOTS),
            ],
        )
        self.assertTrue(all(step["state"] == "done" for step in job.how_far_along()))

    def test_the_plots_change_as_the_passes_go_by(self) -> None:
        told: list[int] = []

        ran(
            mock.MagicMock(),
            mock.MagicMock(),
            Document(STORY),
            identified=lambda plots, paragraphs: told.append(len(plots)),
        )

        self.assertEqual(max(told), len(story_plots.FAKE_STORY_PLOTS))
        self.assertEqual(told[-1], len(story_plots.FAKE_STORY_PLOTS) - 2)

    def test_the_plots_gather_what_happened_along_them(self) -> None:
        told: list[list[dict[str, Any]]] = []

        ran(
            mock.MagicMock(),
            mock.MagicMock(),
            Document(STORY),
            identified=lambda plots, paragraphs: told.append(plots),
        )

        self.assertEqual(len(told[-1][0]["keyEvents"]), 3)

    def test_stops_when_it_is_told_to(self) -> None:
        identified: list[int] = []
        stop = [False]

        ran(
            mock.MagicMock(),
            mock.MagicMock(),
            Document(STORY),
            lambda: stop[0],
            lambda step: stop.__setitem__(0, len(identified) > 3),
            lambda plots, paragraphs: identified.append(len(plots)),
        )

        self.assertLess(len(identified), 10)

    def test_a_document_with_no_prose_is_an_error(self) -> None:
        with self.assertRaises(ValueError):
            ran(
                mock.MagicMock(),
                mock.MagicMock(),
                Document(storydoc.dumps([storydoc.chapter("One")])),
            )


if __name__ == "__main__":
    unittest.main()
