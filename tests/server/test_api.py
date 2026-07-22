from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest import mock

from fastapi.testclient import TestClient
import yaml

from server.api import app, ParallelBuildJobsManager
from server.inference.completion import ModelNotAvailable


DEFAULT_REPLY = (
    '{"nodes": [{"id": 1, "title": "scene", "start": 0, "end": 1}], "edges": []}'
)


def build_fake_completion_model(
    reply: str = DEFAULT_REPLY, status: str = "serving"
) -> mock.MagicMock:
    model = mock.MagicMock()
    model.complete.return_value = reply
    model.status.return_value = status
    return model


class Health(unittest.TestCase):
    def test_reports_download_progress_while_the_model_loads(self) -> None:
        app.state.completion_model = build_fake_completion_model(
            status="37% downloaded"
        )
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"inference_server_status": "37% downloaded"})

    def test_reports_serving_once_the_model_is_ready(self) -> None:
        app.state.completion_model = build_fake_completion_model(status="serving")
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"inference_server_status": "serving"})


def wait_for_build(client: TestClient, build_id: str, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get("/build/status", params={"id": build_id})
        if response.status_code == 200 and not response.json()["running"]:
            return
        time.sleep(0.005)
    raise AssertionError(f"build {build_id} did not finish within {timeout}s")


class Build(unittest.TestCase):
    def setUp(self):
        super().setUp()

        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)

        self.manuscript_paths = []
        for name in ["first", "second"]:
            path = Path(self._dir.name) / f"{name}.md"
            path.write_text("# scene\n\nprose\n")
            self.manuscript_paths.append(str(path))

        def _restore_model():
            app.state.completion_model = None

        self.addCleanup(_restore_model)

        self.model = build_fake_completion_model()
        app.state.completion_model = self.model
        app.state.jobs = ParallelBuildJobsManager()

    def test_build_returns_at_once_then_writes_the_graph_file(self) -> None:
        client = TestClient(app)
        response = client.post("/build", json={"path": self.manuscript_paths[0]})
        self.assertEqual(response.status_code, 202)

        wait_for_build(client, response.json()["id"])

        written = Path(response.json()["path"])
        self.assertTrue(written.exists())
        document = yaml.safe_load(written.read_text())
        self.assertEqual(len(document["layer"]), 2)

    def test_backs_off_while_the_model_is_loading(self) -> None:
        self.model.complete.side_effect = [
            ModelNotAvailable("loading"),
            ModelNotAvailable("loading"),
            DEFAULT_REPLY,
            DEFAULT_REPLY,
        ]
        client = TestClient(app)
        with mock.patch("time.sleep"):
            response = client.post("/build", json={"path": self.manuscript_paths[0]})
            self.assertEqual(response.status_code, 202)
            wait_for_build(client, response.json()["id"])

        self.assertTrue(Path(response.json()["path"]).exists())

    def test_multiple_builds_for_different_files_can_run_in_parallel(self) -> None:
        barrier = threading.Barrier(2)

        def rendezvous(*_args, **_kwargs) -> str:
            barrier.wait(timeout=5)
            return DEFAULT_REPLY

        self.model.complete.side_effect = rendezvous

        client = TestClient(app)
        responses = [
            client.post("/build", json={"path": path})
            for path in self.manuscript_paths
        ]
        for response in responses:
            self.assertEqual(response.status_code, 202)
        for response in responses:
            wait_for_build(client, response.json()["id"])
            self.assertTrue(Path(response.json()["path"]).exists())

    def test_a_second_build_for_the_same_file_supersedes_the_first(self) -> None:
        entered = threading.Semaphore(0)
        release = threading.Event()

        def complete(*_args, **_kwargs) -> str:
            entered.release()
            release.wait(timeout=5)
            return DEFAULT_REPLY

        self.model.complete.side_effect = complete
        path = self.manuscript_paths[0]
        client = TestClient(app)

        first = client.post("/build", json={"path": path})
        self.assertEqual(first.status_code, 202)
        self.assertTrue(entered.acquire(timeout=5))  # first build is in flight
        first_job = app.state.jobs._by_path[path]

        second = client.post("/build", json={"path": path})
        self.assertEqual(second.status_code, 202)
        self.assertTrue(entered.acquire(timeout=5))  # second build is in flight

        release.set()
        wait_for_build(client, second.json()["id"])
        self.assertTrue(first_job.cancelled)


if __name__ == "__main__":
    unittest.main()
