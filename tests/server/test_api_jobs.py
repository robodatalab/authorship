import unittest
from unittest import mock

from fastapi.testclient import TestClient

from server.api import app, ParallelJobsManager


class Jobs(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        app.state.jobs = mock.create_autospec(ParallelJobsManager, instance=True)

    def test_stops_the_job_on_the_file_it_is_asked_to(self) -> None:
        response = TestClient(app).post(
            "/jobs/cancel", json={"path": "/stories/story.author"}
        )

        self.assertEqual(response.status_code, 200)
        app.state.jobs.cancel.assert_called_once_with("/stories/story.author")

    def test_stopping_a_job_nobody_started_is_a_miss(self) -> None:
        app.state.jobs.get.return_value = None

        response = TestClient(app).post(
            "/jobs/cancel", json={"path": "/stories/story.author"}
        )

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
