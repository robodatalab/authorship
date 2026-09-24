import asyncio
import unittest
from unittest import mock

from server.progress import WorkProgress, reporting_progress_to, with_progress


class WithProgressTests(unittest.TestCase):
    def test_hands_out_every_item_unchanged(self) -> None:
        items = list(with_progress(["One", "Two", "Three"], "reading the chapters"))

        self.assertEqual(items, ["One", "Two", "Three"])

    def test_reports_how_far_the_work_has_got_while_it_runs(self) -> None:
        identifying_plots = WorkProgress("identifying plots")

        with reporting_progress_to(identifying_plots):
            chapters = iter(
                with_progress(["One", "Two", "Three"], "reading the chapters")
            )
            next(chapters)
            next(chapters)
            reported = identifying_plots.reported()

        self.assertEqual(
            reported,
            {
                "doing": "identifying plots",
                "done": 0,
                "of": None,
                "seconds": mock.ANY,
                "state": "running",
                "steps": [
                    {
                        "doing": "reading the chapters",
                        "done": 1,
                        "of": 3,
                        "seconds": mock.ANY,
                        "state": "running",
                        "steps": [],
                    }
                ],
            },
        )

    def test_nests_the_work_done_inside_a_loop_under_that_loop(self) -> None:
        identifying_plots = WorkProgress("identifying plots")

        with reporting_progress_to(identifying_plots):
            for _ in with_progress(["first", "second"], "passes"):
                for _ in with_progress(["One", "Two"], "reading the chapters"):
                    pass

        self.assertEqual(
            identifying_plots.reported(),
            {
                "doing": "identifying plots",
                "done": 0,
                "of": None,
                "seconds": mock.ANY,
                "state": "done",
                "steps": [
                    {
                        "doing": "passes",
                        "done": 2,
                        "of": 2,
                        "seconds": mock.ANY,
                        "state": "done",
                        "steps": [
                            {
                                "doing": "reading the chapters",
                                "done": 2,
                                "of": 2,
                                "seconds": mock.ANY,
                                "state": "done",
                                "steps": [],
                            },
                            {
                                "doing": "reading the chapters",
                                "done": 2,
                                "of": 2,
                                "seconds": mock.ANY,
                                "state": "done",
                                "steps": [],
                            },
                        ],
                    }
                ],
            },
        )

    def test_reports_work_of_unknown_length_without_a_total(self) -> None:
        identifying_plots = WorkProgress("identifying plots")

        with reporting_progress_to(identifying_plots):
            for _ in with_progress(iter(["One", "Two"]), "reading the chapters"):
                pass

        self.assertEqual(
            identifying_plots.reported()["steps"],
            [
                {
                    "doing": "reading the chapters",
                    "done": 2,
                    "of": None,
                    "seconds": mock.ANY,
                    "state": "done",
                    "steps": [],
                }
            ],
        )


class ReportingProgressOfAJobTests(unittest.IsolatedAsyncioTestCase):
    async def test_reports_the_items_of_a_stream_against_the_total_it_is_told(
        self,
    ) -> None:
        answering = WorkProgress("answering")
        answers = mock.MagicMock()
        answers.__aiter__.return_value = [0.9, 0.2, 0.3]

        with reporting_progress_to(answering):
            answered = [
                answer
                async for answer in with_progress(answers, "asking", of=3)
            ]

        self.assertEqual(
            [answered, answering.reported()["steps"]],
            [
                [0.9, 0.2, 0.3],
                [
                    {
                        "doing": "asking",
                        "done": 3,
                        "of": 3,
                        "seconds": mock.ANY,
                        "state": "done",
                        "steps": [],
                    }
                ],
            ],
        )

    async def test_collects_the_progress_of_jobs_running_together_apart(
        self,
    ) -> None:
        first_job = WorkProgress("first job")
        second_job = WorkProgress("second job")

        async def reading(work: WorkProgress, chapters: list[str]) -> None:
            with reporting_progress_to(work):
                for _ in with_progress(chapters, "reading the chapters"):
                    await asyncio.sleep(0)

        await asyncio.gather(
            reading(first_job, ["One"]), reading(second_job, ["One", "Two"])
        )

        self.assertEqual(
            [first_job.reported()["steps"], second_job.reported()["steps"]],
            [
                [
                    {
                        "doing": "reading the chapters",
                        "done": 1,
                        "of": 1,
                        "seconds": mock.ANY,
                        "state": "done",
                        "steps": [],
                    }
                ],
                [
                    {
                        "doing": "reading the chapters",
                        "done": 2,
                        "of": 2,
                        "seconds": mock.ANY,
                        "state": "done",
                        "steps": [],
                    }
                ],
            ],
        )


if __name__ == "__main__":
    unittest.main()
