import asyncio
import os
import subprocess
import sys
import time
import unittest
from typing import Any
from unittest import mock

from server.jobs import Job, ParallelJobsManager
from server.progress import with_progress


class CountsToThree(Job):
    kind = "counting"

    def __init__(self, target: str) -> None:
        super().__init__(target)
        self.counted = 0

    async def execute(self) -> None:
        for _ in with_progress(range(3), "counting"):
            self.counted += 1

    def snapshot(self) -> dict[str, Any]:
        return {"counted": self.counted}


class FindsNothingToDo(Job):
    kind = "nothing"

    async def execute(self) -> None:
        raise ValueError("There is nothing to do.")

    def snapshot(self) -> dict[str, Any]:
        return {}


class RunsUntilStopped(Job):
    kind = "endless"

    def __init__(self, target: str) -> None:
        super().__init__(target)
        self.ticks = 0

    async def execute(self) -> None:
        while True:
            await asyncio.sleep(0.01)
            self.ticks += 1

    def snapshot(self) -> dict[str, Any]:
        process = os.getpid()
        return {"ticks": self.ticks, "process": process}


class ParallelJobsManagerRunningJobs(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.jobs = ParallelJobsManager()

    def wait_for_the_end(self, target: str) -> dict[str, Any]:
        deadline = time.monotonic() + 30.0
        while time.monotonic() < deadline:
            reported = self.jobs.reported(target)
            if not reported["running"]:
                return reported
            time.sleep(0.01)
        raise AssertionError(f"the job for {target} did not end")

    def wait_until_it_runs(self, target: str) -> None:
        deadline = time.monotonic() + 30.0
        while time.monotonic() < deadline:
            statuses = [job["status"] for job in self.jobs.in_flight() if job["path"] == target]
            if statuses == ["running"]:
                return
            time.sleep(0.01)
        raise AssertionError(f"the job for {target} did not start")

    def wait_for_the_process_to_end(self, process: int) -> bool:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            try:
                os.kill(process, 0)
            except ProcessLookupError:
                return True
            time.sleep(0.01)
        return False

    def test_hands_back_what_a_job_reports_once_it_is_done(self) -> None:
        self.jobs.start(CountsToThree("story.author"))

        reported = self.wait_for_the_end("story.author")

        self.assertEqual(reported, {"running": False, "error": None, "counted": 3})

    def test_reports_why_a_job_failed(self) -> None:
        self.jobs.start(FindsNothingToDo("story.author"))

        reported = self.wait_for_the_end("story.author")

        self.assertEqual(reported, {"running": False, "error": "There is nothing to do."})

    def test_reports_a_job_waiting_for_its_process_as_it_stands(self) -> None:
        self.jobs.start(RunsUntilStopped("story.author"))
        self.addCleanup(self.jobs.cancel, "story.author")

        reported = self.jobs.reported("story.author")
        in_flight = self.jobs.in_flight()

        self.assertEqual(reported, {"running": True, "error": None, "ticks": 0, "process": mock.ANY})
        self.assertEqual(in_flight, [{"kind": "endless", "path": "story.author", "status": "pending"}])

    def test_stopping_a_running_job_kills_its_process_at_once(self) -> None:
        self.jobs.start(RunsUntilStopped("story.author"))
        self.wait_until_it_runs("story.author")
        job_process = self.jobs.reported("story.author")["process"]

        stopped_at = time.monotonic()
        self.jobs.cancel("story.author")
        reported = self.wait_for_the_end("story.author")
        seconds_it_took = time.monotonic() - stopped_at
        job_process_ended = self.wait_for_the_process_to_end(job_process)

        self.assertEqual(reported, {"running": False, "error": None, "ticks": mock.ANY, "process": job_process})
        self.assertTrue(job_process_ended)
        self.assertLess(seconds_it_took, 1.0)

    def test_a_newer_job_for_the_same_file_kills_the_older(self) -> None:
        self.jobs.start(RunsUntilStopped("story.author"))
        self.wait_until_it_runs("story.author")
        older_process = self.jobs.reported("story.author")["process"]

        self.jobs.start(CountsToThree("story.author"))
        reported = self.wait_for_the_end("story.author")
        older_process_ended = self.wait_for_the_process_to_end(older_process)

        self.assertTrue(older_process_ended)
        self.assertEqual(reported, {"running": False, "error": None, "counted": 3})

    def test_stopping_a_job_that_is_done_drops_it(self) -> None:
        self.jobs.start(CountsToThree("story.author"))
        self.wait_for_the_end("story.author")

        self.jobs.cancel("story.author")

        self.assertIsNone(self.jobs.get("story.author"))

    def test_lists_only_the_jobs_still_in_flight(self) -> None:
        self.jobs.start(RunsUntilStopped("endless.author"))
        self.addCleanup(self.jobs.cancel, "endless.author")
        self.jobs.start(CountsToThree("counting.author"))
        self.wait_until_it_runs("endless.author")
        self.wait_for_the_end("counting.author")

        in_flight = self.jobs.in_flight()

        self.assertEqual(in_flight, [{"kind": "endless", "path": "endless.author", "status": "running"}])


class ParallelJobsManagerEndingWithTheServer(unittest.TestCase):
    def test_a_job_ends_with_the_server_killed_under_it(self) -> None:
        server = subprocess.run(
            [
                sys.executable,
                "-c",
                "import os, signal, time\n"
                "from server.jobs import ParallelJobsManager\n"
                "from tests.server.test_jobs import RunsUntilStopped\n"
                "jobs = ParallelJobsManager()\n"
                "jobs.start(RunsUntilStopped('story.author'))\n"
                "while jobs.in_flight()[0]['status'] != 'running':\n"
                "    time.sleep(0.01)\n"
                "print(jobs.reported('story.author')['process'], flush=True)\n"
                "os.kill(os.getpid(), signal.SIGKILL)\n",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        job_process = int(server.stdout)

        deadline = time.monotonic() + 5.0
        job_process_alive = True
        while job_process_alive and time.monotonic() < deadline:
            try:
                os.kill(job_process, 0)
            except ProcessLookupError:
                job_process_alive = False
            time.sleep(0.01)

        self.assertFalse(job_process_alive)
