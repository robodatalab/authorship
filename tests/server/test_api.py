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
from roost.resource_manager import (
    MemoryReading,
    ModelKind,
    ModelNotAvailable,
)
from server.representations.semantic_search import SearchIndex


DEFAULT_REPLY = (
    '{"nodes": [{"id": 1, "title": "scene", "start": 0, "end": 1}], "edges": []}'
)


def build_fake_completion_model(reply: str = DEFAULT_REPLY) -> mock.MagicMock:
    model = mock.MagicMock()
    model.complete.return_value = reply
    return model


def build_fake_kind(model_id: str) -> mock.MagicMock:
    kind = mock.MagicMock(spec=ModelKind)
    kind.model_id = model_id
    return kind


class Health(unittest.TestCase):
    def test_reports_serving_while_a_model_is_loaded(self) -> None:
        app.state.models = mock.Mock(residents=[build_fake_kind("Qwen/Qwen3.5-4B")])
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"inference_server_status": "serving"})

    def test_reports_unloaded_when_no_model_is_loaded(self) -> None:
        app.state.models = mock.Mock(residents=[])
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"inference_server_status": "unloaded"})


class Models(unittest.TestCase):
    def test_lists_each_model_and_marks_the_loaded_one(self) -> None:
        classifier = build_fake_kind("Qwen/Qwen3.5-4B")
        grammar = build_fake_kind("grammarly/coedit-xl")
        app.state.inference_models = [classifier, grammar]
        app.state.models = mock.Mock(residents=[grammar])

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


class Memory(unittest.TestCase):
    def test_reports_what_the_models_hold_and_which_they_are(self) -> None:
        app.state.models = mock.Mock(
            residents=[build_fake_kind("grammarly/coedit-xl")]
        )
        app.state.models.memory.return_value = MemoryReading(6.2, 30.2, 9.4)

        response = TestClient(app).get("/memory")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["gpu"], {"used": 6.2, "limit": 30.2})
        self.assertEqual(body["process"], 9.4)
        self.assertEqual(body["serving"], "grammarly/coedit-xl")
        self.assertGreater(body["machine"], 0)

    def test_reads_on_with_no_model_loaded(self) -> None:
        app.state.models = mock.Mock(residents=[])
        app.state.models.memory.return_value = MemoryReading(0.0, 30.2, 0.3)

        response = TestClient(app).get("/memory")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNone(body["serving"])
        self.assertEqual(body["gpu"], {"used": 0.0, "limit": 30.2})
        self.assertEqual(body["process"], 0.3)


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
        self.manuscript.write_text(
            "## One\n\nteh cat.\n\n## Two\n\nteh dog.\n", encoding="utf-8"
        )

        def _restore_model():
            app.state.grammar_model = None

        self.addCleanup(_restore_model)

        app.state.grammar_model = build_fake_completion_model(reply="the cat.")
        app.state.jobs = ParallelJobsManager()

    def test_corrects_the_section_the_cursor_is_in_and_leaves_the_rest(self) -> None:
        client = TestClient(app)
        started = client.post(
            "/fix/grammar", json={"path": str(self.manuscript), "line": 2}
        )
        self.assertEqual(started.status_code, 202)

        status = wait_for_grammar(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(
            self.manuscript.read_text(),
            "## One\n\nthe cat.\n\n## Two\n\nteh dog.\n",
        )

    def test_corrects_the_selected_lines_rather_than_the_section_around_them(
        self,
    ) -> None:
        client = TestClient(app)
        started = client.post(
            "/fix/grammar",
            json={
                "path": str(self.manuscript),
                "line": 6,
                "selection": {"start": 6, "end": 6},
            },
        )
        self.assertEqual(started.status_code, 202)

        status = wait_for_grammar(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(
            self.manuscript.read_text(),
            "## One\n\nteh cat.\n\n## Two\n\nthe cat.\n",
        )

    def test_a_selection_of_blank_lines_has_nothing_to_correct(self) -> None:
        # Where a section ends is the server's to say, and so is whether there is
        # prose in it — which it only knows once the job has the manuscript open.
        client = TestClient(app)
        started = client.post(
            "/fix/grammar",
            json={
                "path": str(self.manuscript),
                "line": 3,
                "selection": {"start": 3, "end": 3},
            },
        )
        self.assertEqual(started.status_code, 202)

        status = wait_for_grammar(client, started.json()["id"])
        self.assertEqual(status["error"], "There is no prose there to correct.")
        self.assertEqual(
            self.manuscript.read_text(), "## One\n\nteh cat.\n\n## Two\n\nteh dog.\n"
        )

    def test_a_missing_manuscript_is_a_bad_request(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/fix/grammar",
            json={"path": str(self.manuscript.with_name("nope.md")), "line": 0},
        )
        self.assertEqual(response.status_code, 400)


class Jobs(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.manuscript = Path(self._dir.name) / "story.md"
        self.manuscript.write_text("## One\n\nteh cat.\n", encoding="utf-8")

        def _restore_model():
            app.state.grammar_model = None

        self.addCleanup(_restore_model)
        app.state.jobs = ParallelJobsManager()

    def test_lists_the_work_in_flight_and_drops_it_once_finished(self) -> None:
        entered = threading.Semaphore(0)
        release = threading.Event()

        def complete(*_args, **_kwargs) -> str:
            entered.release()
            release.wait(timeout=5)
            return "the cat."

        model = build_fake_completion_model()
        model.complete.side_effect = complete
        app.state.grammar_model = model
        client = TestClient(app)

        started = client.post(
            "/fix/grammar", json={"path": str(self.manuscript), "line": 0}
        )
        self.assertTrue(entered.acquire(timeout=5))

        response = client.get("/jobs")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "jobs": [
                    {
                        "kind": "grammar fix",
                        "path": str(self.manuscript),
                        "status": "running",
                    }
                ]
            },
        )

        release.set()
        wait_for_grammar(client, started.json()["id"])
        self.assertEqual(client.get("/jobs").json(), {"jobs": []})


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


def wait_for_indexing(client: TestClient, timeout: float = 5.0) -> None:
    """Indexing has no status of its own; the job list is where it ends."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        jobs = client.get("/jobs").json()["jobs"]
        if not any(job["kind"] == "search index" for job in jobs):
            return
        time.sleep(0.005)
    raise AssertionError(f"indexing did not finish within {timeout}s")


class Search(unittest.TestCase):
    STORY = "## One\n\nthe gate swung shut\n\nshe poured the tea\n"
    VECTORS = {
        "the gate swung shut": [1.0, 0.0],
        "she poured the tea": [0.0, 1.0],
        "the gate": [1.0, 0.0],
    }

    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.manuscript = Path(self._dir.name) / "story.md"
        self.manuscript.write_text(self.STORY, encoding="utf-8")

        def _restore_model():
            app.state.encoder_model = None

        self.addCleanup(_restore_model)

        model = mock.MagicMock()
        model.encode.side_effect = lambda texts: [self.VECTORS[text] for text in texts]

        app.state.encoder_model = model
        app.state.search_index = SearchIndex()
        app.state.jobs = ParallelJobsManager()

    def test_a_manuscript_not_yet_encoded_answers_nothing_and_says_so(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/search", json={"path": str(self.manuscript), "phrase": "the gate"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"hits": [], "pending": 2})

    def test_indexing_then_searching_finds_the_passage(self) -> None:
        client = TestClient(app)
        started = client.post("/search/index", json={"path": str(self.manuscript)})
        self.assertEqual(started.status_code, 202)
        wait_for_indexing(client)

        response = client.post(
            "/search", json={"path": str(self.manuscript), "phrase": "the gate"}
        )
        self.assertEqual(
            response.json(),
            {
                "hits": [
                    {
                        "start": 2,
                        "end": 2,
                        "score": 1.0,
                        "text": "the gate swung shut",
                    }
                ],
                "pending": 0,
            },
        )

    def test_the_indexing_is_among_the_work_the_server_has_in_hand(self) -> None:
        # It writes no file and reports no progress, so appearing here is the
        # only account it gives of itself.
        entered = threading.Semaphore(0)
        release = threading.Event()

        def encode(texts):
            entered.release()
            release.wait(timeout=5)
            return [self.VECTORS[text] for text in texts]

        app.state.encoder_model.encode.side_effect = encode
        client = TestClient(app)

        client.post("/search/index", json={"path": str(self.manuscript)})
        self.assertTrue(entered.acquire(timeout=5))

        self.assertEqual(
            client.get("/jobs").json(),
            {
                "jobs": [
                    {
                        "kind": "search index",
                        "path": str(self.manuscript),
                        "status": "running",
                    }
                ]
            },
        )

        release.set()
        wait_for_indexing(client)

    def test_a_missing_manuscript_is_a_bad_request(self) -> None:
        client = TestClient(app)
        missing = str(self.manuscript.with_name("nope.md"))
        self.assertEqual(
            client.post("/search/index", json={"path": missing}).status_code, 400
        )
        self.assertEqual(
            client.post("/search", json={"path": missing, "phrase": "x"}).status_code,
            400,
        )


if __name__ == "__main__":
    unittest.main()
