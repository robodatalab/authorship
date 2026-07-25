from pathlib import Path
import tempfile
import threading
import time
import unittest
import zipfile
from unittest import mock

from fastapi.testclient import TestClient
import yaml

from server.api import app, ParallelJobsManager
from server.inference.inference import ModelNotAvailable


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
    def test_reports_the_resident_models_download_progress(self) -> None:
        app.state.models = mock.Mock(
            resident=build_fake_completion_model(status="37% downloaded")
        )
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"inference_server_status": "37% downloaded"})

    def test_reports_serving_once_the_resident_model_is_ready(self) -> None:
        app.state.models = mock.Mock(
            resident=build_fake_completion_model(status="serving")
        )
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"inference_server_status": "serving"})

    def test_reports_unloaded_when_no_model_is_resident(self) -> None:
        app.state.models = mock.Mock(resident=None)
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"inference_server_status": "unloaded"})


class Models(unittest.TestCase):
    def test_lists_each_model_and_marks_the_resident(self) -> None:
        classifier = build_fake_completion_model(status="unloaded")
        classifier.model_id = "Qwen/Qwen3.5-4B"
        grammar = build_fake_completion_model(status="serving")
        grammar.model_id = "grammarly/coedit-xl"
        app.state.inference_models = [classifier, grammar]
        app.state.models = mock.Mock(resident=grammar)

        response = TestClient(app).get("/models")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "models": [
                    {
                        "model": "Qwen/Qwen3.5-4B",
                        "status": "unloaded",
                        "resident": False,
                    },
                    {
                        "model": "grammarly/coedit-xl",
                        "status": "serving",
                        "resident": True,
                    },
                ]
            },
        )


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
        app.state.jobs = ParallelJobsManager()

    def test_build_returns_at_once_then_writes_the_graph_file(self) -> None:
        client = TestClient(app)
        response = client.post("/build", json={"path": self.manuscript_paths[0]})
        self.assertEqual(response.status_code, 202)

        wait_for_build(client, response.json()["id"])

        written = Path(response.json()["path"])
        self.assertTrue(written.exists())
        document = yaml.safe_load(written.read_text())
        # One layer per perspective: scene, plot and character.
        self.assertEqual(len(document["layer"]), 3)

    def test_backs_off_while_the_model_is_loading(self) -> None:
        # Unavailable for the first couple of calls, then serving. A function
        # rather than a fixed list of replies, so the test doesn't depend on how
        # many completions a full build makes (one per perspective, and the whole
        # set is retried together).
        attempts = 0

        def complete(*_args, **_kwargs) -> str:
            nonlocal attempts
            attempts += 1
            if attempts <= 2:
                raise ModelNotAvailable("loading")
            return DEFAULT_REPLY

        self.model.complete.side_effect = complete
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
        first_job = app.state.jobs.get(first.json()["id"])

        second = client.post("/build", json={"path": path})
        self.assertEqual(second.status_code, 202)
        self.assertTrue(entered.acquire(timeout=5))  # second build is in flight

        release.set()
        wait_for_build(client, second.json()["id"])
        self.assertTrue(first_job.cancelled)


def wait_for_grammar(client: TestClient, job_id: str, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get("/fix/grammar/status", params={"id": job_id})
        if response.status_code == 200 and not response.json()["running"]:
            return response.json()
        time.sleep(0.005)
    raise AssertionError(f"grammar job {job_id} did not finish within {timeout}s")


class GrammarFix(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.manuscript = Path(self._dir.name) / "story.md"
        self.manuscript.write_text("teh cat.\n", encoding="utf-8")

        def _restore_model():
            app.state.grammar_model = None

        self.addCleanup(_restore_model)

        app.state.grammar_model = build_fake_completion_model(reply="the cat.")
        app.state.jobs = ParallelJobsManager()

    def test_corrects_in_the_background_then_returns_the_text(self) -> None:
        client = TestClient(app)
        started = client.post("/fix/grammar", json={"path": str(self.manuscript)})
        self.assertEqual(started.status_code, 202)

        status = wait_for_grammar(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(status["text"], "the cat.")

    def test_a_missing_manuscript_is_a_bad_request(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/fix/grammar",
            json={"path": str(self.manuscript.with_name("nope.md"))},
        )
        self.assertEqual(response.status_code, 400)


class ExportEpub(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.manuscript = Path(self._dir.name) / "story.md"
        self.manuscript.write_text("# Book\n\n## One\n\nprose\n", encoding="utf-8")

    def test_writes_the_epub_beside_the_manuscript(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={"path": str(self.manuscript), "author": "A. Writer"},
        )
        self.assertEqual(response.status_code, 200)

        written = Path(response.json()["path"])
        self.assertEqual(written, self.manuscript.with_suffix(".epub"))
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))

    def test_a_missing_manuscript_is_a_bad_request(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={"path": str(self.manuscript.with_name("nope.md"))},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
