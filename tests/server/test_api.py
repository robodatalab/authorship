from pathlib import Path
import tempfile
import threading
import time
import unittest
import zipfile
from unittest import mock

from fastapi.testclient import TestClient

from server.api import app, ParallelJobsManager
from vramen.resource_manager import (
    MemoryReading,
    ModelKind,
)
from server import storydoc


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
        self.document = Path(self._dir.name) / f"story{storydoc.EXTENSION}"
        self.written = storydoc.dumps(
            [
                storydoc.chapter("One"),
                storydoc.markdown("teh cat."),
                storydoc.chapter("Two"),
                storydoc.markdown("teh dog."),
            ]
        )
        self.document.write_text(self.written, encoding="utf-8")

        def _restore_model():
            app.state.grammar_model = None

        self.addCleanup(_restore_model)

        app.state.grammar_model = build_fake_completion_model(reply="the cat.")
        app.state.jobs = ParallelJobsManager()

    def test_corrects_the_section_the_cursor_is_in_and_leaves_the_rest(self) -> None:
        client = TestClient(app)
        started = client.post(
            "/fix/grammar", json={"path": str(self.document), "line": 4}
        )
        self.assertEqual(started.status_code, 202)

        status = wait_for_grammar(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(
            self.document.read_text(),
            self.written.replace("teh cat.", "the cat."),
        )

    def test_corrects_the_selected_lines_rather_than_the_section_around_them(
        self,
    ) -> None:
        client = TestClient(app)
        started = client.post(
            "/fix/grammar",
            json={
                "path": str(self.document),
                "line": 10,
                "selection": {"start": 10, "end": 10},
            },
        )
        self.assertEqual(started.status_code, 202)

        status = wait_for_grammar(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(
            self.document.read_text(),
            self.written.replace("teh dog.", "the cat."),
        )

    def test_a_selection_of_blank_lines_has_nothing_to_correct(self) -> None:
        # Where a section ends is the server's to say, and so is whether there is
        # prose in it — which it only knows once the job has the document open.
        client = TestClient(app)
        started = client.post(
            "/fix/grammar",
            json={
                "path": str(self.document),
                "line": 3,
                "selection": {"start": 3, "end": 3},
            },
        )
        self.assertEqual(started.status_code, 202)

        status = wait_for_grammar(client, started.json()["id"])
        self.assertEqual(status["error"], "There is no prose there to correct.")
        self.assertEqual(
            self.document.read_text(), self.written
        )

    def test_a_missing_document_is_a_bad_request(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/fix/grammar",
            json={"path": str(self.document.with_name("nope.author")), "line": 0},
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


def wait_for_blurb(client: TestClient, job_id: str, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get("/generate/blurb/status", params={"id": job_id})
        if response.status_code == 200 and not response.json()["running"]:
            return response.json()
        time.sleep(0.005)
    raise AssertionError(f"blurb job {job_id} did not finish within {timeout}s")


class GenerateBlurb(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.document = Path(self._dir.name) / f"story{storydoc.EXTENSION}"
        self.written = storydoc.dumps(
            [
                storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Veriona"}),
                storydoc.chapter("One"),
                storydoc.markdown("prose"),
                storydoc.Cell(storydoc.BLURB, "", {}),
            ]
        )
        self.document.write_text(self.written, encoding="utf-8")
        app.state.jobs = ParallelJobsManager()

    def test_runs_as_a_job_and_hands_the_blurb_back(self) -> None:
        client = TestClient(app)
        started = client.post("/generate/blurb", json={"path": str(self.document)})
        self.assertEqual(started.status_code, 202)

        status = wait_for_blurb(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertIn("Veriona", status["blurb"])

    def test_leaves_the_document_alone(self) -> None:
        # The blurb comes back for the editor to place; a job that wrote it into
        # the file would be writing a cell the editor owns.
        client = TestClient(app)
        started = client.post("/generate/blurb", json={"path": str(self.document)})
        wait_for_blurb(client, started.json()["id"])
        self.assertEqual(self.document.read_text(), self.written)

    def test_is_dropped_from_the_work_in_hand_once_it_has_finished(self) -> None:
        client = TestClient(app)
        started = client.post("/generate/blurb", json={"path": str(self.document)})
        wait_for_blurb(client, started.json()["id"])
        self.assertEqual(client.get("/jobs").json(), {"jobs": []})

    def test_a_missing_document_is_a_bad_request(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/generate/blurb",
            json={"path": str(self.document.with_name("nope.author"))},
        )
        self.assertEqual(response.status_code, 400)

    def test_asking_after_a_job_nobody_started_is_a_miss(self) -> None:
        client = TestClient(app)
        response = client.get("/generate/blurb/status", params={"id": "nothing"})
        self.assertEqual(response.status_code, 404)


class ExportEpub(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.document = Path(self._dir.name) / f"story{storydoc.EXTENSION}"
        storydoc.save(
            self.document,
            [
                storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Book"}),
                storydoc.chapter("One"),
                storydoc.markdown("prose"),
            ],
        )

    def test_writes_the_epub_beside_the_document(self) -> None:
        client = TestClient(app)
        response = client.post("/export/epub", json={"path": str(self.document)})
        self.assertEqual(response.status_code, 200)

        written = Path(response.json()["path"])
        self.assertEqual(written, self.document.with_suffix(".epub"))
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))

    def test_a_missing_document_is_a_bad_request(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={"path": str(self.document.with_name("nope.author"))},
        )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
