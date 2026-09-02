import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import zipfile
from unittest import mock

from fastapi.testclient import TestClient

from server.api import app, ParallelJobsManager
from server.writing_tools.gemini import GeminiError
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
                        "cancelled": False,
                    }
                ]
            },
        )

        release.set()
        wait_for_grammar(client, started.json()["id"])
        self.assertEqual(client.get("/jobs").json(), {"jobs": []})

    def test_any_job_can_be_stopped_and_says_so_while_it_finishes(self) -> None:
        # Cancelling belongs to the jobs framework rather than to any one tool:
        # what the drawer stops is a job, and this one writes no blurbs.
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

        cancelled = client.post(
            "/jobs/cancel", json={"path": str(self.manuscript)}
        )
        self.assertEqual(cancelled.status_code, 200)

        # Told and finished are not the same moment: it is still working on the
        # paragraph it had in hand when the button was pressed.
        self.assertEqual(
            client.get("/jobs").json(),
            {
                "jobs": [
                    {
                        "kind": "grammar fix",
                        "path": str(self.manuscript),
                        "status": "running",
                        "cancelled": True,
                    }
                ]
            },
        )

        release.set()
        status = wait_for_grammar(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(client.get("/jobs").json(), {"jobs": []})
        # A correction half done is not written: the file is as it was.
        self.assertEqual(
            self.manuscript.read_text(), "## One\n\nteh cat.\n"
        )

    def test_stopping_a_job_nobody_started_is_a_miss(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/jobs/cancel", json={"path": str(self.manuscript)}
        )
        self.assertEqual(response.status_code, 404)


def wait_for_writing(client: TestClient, job_id: str, timeout: float = 5.0) -> dict:
    """The finished answer of whichever section is being written for a document."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get("/generate/status", params={"id": job_id})
        if response.status_code == 200 and not response.json()["running"]:
            return response.json()
        time.sleep(0.005)
    raise AssertionError(f"writing job {job_id} did not finish within {timeout}s")


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
                storydoc.markdown("The lantern had gone out."),
                storydoc.chapter("Two"),
                storydoc.markdown("The door stood open."),
                storydoc.Cell(storydoc.BLURB, "", {}),
            ]
        )
        self.document.write_text(self.written, encoding="utf-8")

        def _restore_model():
            app.state.causal_model = None

        self.addCleanup(_restore_model)

        app.state.causal_model = build_fake_completion_model(
            reply="A woman loses her name."
        )
        app.state.jobs = ParallelJobsManager()

    def test_runs_as_a_job_and_hands_the_blurb_back(self) -> None:
        client = TestClient(app)
        started = client.post("/generate/blurb", json={"path": str(self.document)})
        self.assertEqual(started.status_code, 202)

        status = wait_for_writing(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(status["text"], "A woman loses her name.")
        self.assertEqual(status["kind"], storydoc.BLURB)
        self.assertEqual(status["progress"], {"written": 2, "chapters": 2})

    def test_leaves_the_document_alone(self) -> None:
        # The blurb comes back for the editor to place; a job that wrote it into
        # the file would be writing a cell the editor owns.
        client = TestClient(app)
        started = client.post("/generate/blurb", json={"path": str(self.document)})
        wait_for_writing(client, started.json()["id"])
        self.assertEqual(self.document.read_text(), self.written)

    def test_is_dropped_from_the_work_in_hand_once_it_has_finished(self) -> None:
        client = TestClient(app)
        started = client.post("/generate/blurb", json={"path": str(self.document)})
        wait_for_writing(client, started.json()["id"])
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
        response = client.get("/generate/status", params={"id": "nothing"})
        self.assertEqual(response.status_code, 404)

    def test_says_how_much_of_the_story_it_has_read_while_it_reads(self) -> None:
        # The one division the work has is chapters, and it is what the editor
        # draws its bar from — so it has to be answerable mid-job, not after.
        entered = threading.Semaphore(0)
        release = threading.Event()

        def complete(*_args, **_kwargs) -> str:
            entered.release()
            release.wait(timeout=5)
            return "A woman loses her name."

        app.state.causal_model.complete.side_effect = complete
        client = TestClient(app)

        started = client.post("/generate/blurb", json={"path": str(self.document)})
        self.assertTrue(entered.acquire(timeout=5))

        status = client.get(
            "/generate/status", params={"id": started.json()["id"]}
        )
        self.assertTrue(status.json()["running"])
        self.assertEqual(status.json()["progress"], {"written": 0, "chapters": 2})

        release.set()
        self.assertEqual(
            wait_for_writing(client, started.json()["id"])["progress"],
            {"written": 2, "chapters": 2},
        )

    def test_stopping_it_leaves_the_blurb_unwritten(self) -> None:
        # Stopping has to reach the job itself: a client that merely stopped
        # asking would leave the model reading the rest of the book.
        entered = threading.Semaphore(0)
        release = threading.Event()

        def complete(*_args, **_kwargs) -> str:
            entered.release()
            release.wait(timeout=5)
            return "A woman loses her name."

        app.state.causal_model.complete.side_effect = complete
        client = TestClient(app)

        started = client.post("/generate/blurb", json={"path": str(self.document)})
        self.assertTrue(entered.acquire(timeout=5))

        cancelled = client.post("/jobs/cancel", json={"path": str(self.document)})
        self.assertEqual(cancelled.status_code, 200)
        release.set()

        status = wait_for_writing(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(status["text"], "")
        # The second chapter was never read: stopping is what it did, not merely
        # what it was told.
        self.assertEqual(app.state.causal_model.complete.call_count, 1)
        self.assertEqual(status["progress"], {"written": 1, "chapters": 2})
        self.assertEqual(client.get("/jobs").json(), {"jobs": []})

    def test_stopping_it_leaves_the_document_as_the_author_left_it(self) -> None:
        entered = threading.Semaphore(0)
        release = threading.Event()

        def complete(*_args, **_kwargs) -> str:
            entered.release()
            release.wait(timeout=5)
            return "A woman loses her name."

        app.state.causal_model.complete.side_effect = complete
        client = TestClient(app)

        started = client.post("/generate/blurb", json={"path": str(self.document)})
        self.assertTrue(entered.acquire(timeout=5))
        client.post("/jobs/cancel", json={"path": str(self.document)})
        release.set()
        wait_for_writing(client, started.json()["id"])

        self.assertEqual(self.document.read_text(), self.written)

    def test_stopping_a_job_nobody_started_is_a_miss(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/jobs/cancel",
            json={"path": str(self.document.with_name("nope.author"))},
        )
        self.assertEqual(response.status_code, 404)

    def test_stopping_one_that_has_already_finished_is_no_failure(self) -> None:
        # The click and the last chapter can land in either order, and an author
        # who pressed stop wanted a job that is not running.
        client = TestClient(app)
        started = client.post("/generate/blurb", json={"path": str(self.document)})
        wait_for_writing(client, started.json()["id"])

        cancelled = client.post("/jobs/cancel", json={"path": str(self.document)})
        self.assertEqual(cancelled.status_code, 200)


class GenerateRecap(unittest.TestCase):
    """The story so far, written out of the documents the section names.

    Where a blurb is written from the document it stands in, this one is written
    from the ones before it — so what is tested here beyond the blurb's own is
    how those are named, resolved and ordered.
    """

    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.folder = Path(self._dir.name)
        self.document = self.folder / f"story{storydoc.EXTENSION}"
        storydoc.save(
            self.document,
            [
                storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Veriona III"}),
                storydoc.Cell(storydoc.RECAP, "", {"documents": "a.author, b.author"}),
                storydoc.chapter("One"),
                storydoc.markdown("The road ended at a gate."),
            ],
        )
        self.written = self.document.read_text()
        for name, title, prose in [
            ("a.author", "Veriona", "The lantern had gone out."),
            ("b.author", "Veriona II", "The door stood open."),
        ]:
            storydoc.save(
                self.folder / name,
                [
                    storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": title}),
                    storydoc.chapter("One"),
                    storydoc.markdown(prose),
                ],
            )

        def _restore_model():
            app.state.causal_model = None

        self.addCleanup(_restore_model)

        app.state.causal_model = build_fake_completion_model(
            reply="She has lost her name."
        )
        app.state.jobs = ParallelJobsManager()

    def start(self, *documents: str):
        return TestClient(app).post(
            "/generate/recap",
            json={"path": str(self.document), "documents": list(documents)},
        )

    def test_runs_as_a_job_and_hands_the_story_so_far_back(self) -> None:
        client = TestClient(app)
        started = self.start("a.author", "b.author")
        self.assertEqual(started.status_code, 202)

        status = wait_for_writing(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(status["text"], "She has lost her name.")
        self.assertEqual(status["kind"], storydoc.RECAP)
        self.assertEqual(status["progress"], {"written": 2, "chapters": 2})

    def test_says_which_section_is_being_written(self) -> None:
        # A document may hold a blurb and a story so far, and only one of them
        # asked — so the editor is told which cell the answer belongs in.
        client = TestClient(app)
        started = self.start("a.author")
        self.assertEqual(
            wait_for_writing(client, started.json()["id"])["kind"], storydoc.RECAP
        )

    def test_the_documents_are_named_beside_the_one_that_asks(self) -> None:
        # A relative path is what the section carries, so the story survives being
        # moved, checked out somewhere else, or written on another machine.
        client = TestClient(app)
        started = self.start("a.author")
        wait_for_writing(client, started.json()["id"])
        said = app.state.causal_model.complete.call_args_list[0].args[1]
        self.assertIn("The lantern had gone out.", said)

    def test_they_are_read_in_alphabetical_order_however_they_were_named(self) -> None:
        client = TestClient(app)
        started = self.start("b.author", "a.author")
        wait_for_writing(client, started.json()["id"])
        first, second = (
            call.args[1] for call in app.state.causal_model.complete.call_args_list
        )
        self.assertIn("The lantern had gone out.", first)
        self.assertIn("The door stood open.", second)

    def test_a_tenth_volume_is_read_after_the_second_and_not_before_it(self) -> None:
        # `part_10` sorts between `part_1` and `part_2` alphabetically, which
        # would hand the model the story out of order — and a serial long enough
        # to need a recap is exactly the one with ten parts.
        for name, prose in [
            ("part_2.author", "The door stood open."),
            ("part_10.author", "The gate was shut."),
        ]:
            storydoc.save(
                self.folder / name,
                [storydoc.chapter("One"), storydoc.markdown(prose)],
            )
        client = TestClient(app)
        started = self.start("part_10.author", "part_2.author")
        wait_for_writing(client, started.json()["id"])
        first, second = (
            call.args[1] for call in app.state.causal_model.complete.call_args_list
        )
        self.assertIn("The door stood open.", first)
        self.assertIn("The gate was shut.", second)

    def test_a_document_named_twice_is_read_once(self) -> None:
        client = TestClient(app)
        started = self.start("a.author", "a.author")
        wait_for_writing(client, started.json()["id"])
        self.assertEqual(app.state.causal_model.complete.call_count, 1)

    def test_leaves_every_document_alone(self) -> None:
        # The recap comes back for the editor to place, exactly as a blurb does.
        client = TestClient(app)
        started = self.start("a.author", "b.author")
        wait_for_writing(client, started.json()["id"])
        self.assertEqual(self.document.read_text(), self.written)

    def test_a_section_naming_no_documents_is_a_bad_request(self) -> None:
        # Nothing to read is not an empty recap; it is a section nobody filled in.
        self.assertEqual(self.start().status_code, 400)

    def test_a_document_that_is_not_there_is_a_bad_request(self) -> None:
        # Said before the model is loaded rather than a minute into the reading.
        self.assertEqual(self.start("a.author", "gone.author").status_code, 400)

    def test_stopping_it_leaves_the_story_so_far_unwritten(self) -> None:
        entered = threading.Semaphore(0)
        release = threading.Event()

        def complete(*_args, **_kwargs) -> str:
            entered.release()
            release.wait(timeout=5)
            return "She has lost her name."

        app.state.causal_model.complete.side_effect = complete
        client = TestClient(app)

        started = self.start("a.author", "b.author")
        self.assertTrue(entered.acquire(timeout=5))
        self.assertEqual(
            client.post("/jobs/cancel", json={"path": str(self.document)}).status_code,
            200,
        )
        release.set()

        status = wait_for_writing(client, started.json()["id"])
        self.assertIsNone(status["error"])
        self.assertEqual(status["text"], "")
        self.assertEqual(app.state.causal_model.complete.call_count, 1)


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

    def _ready(self) -> None:
        """Write the document out with every section a book needs filled in."""
        (Path(self._dir.name) / "art.png").write_bytes(b"png")
        storydoc.save(
            self.document,
            [
                storydoc.Cell(storydoc.COVER, "", {"src": "art.png"}),
                storydoc.Cell(
                    storydoc.TITLE_PAGE,
                    "",
                    {
                        "title": "Book",
                        "subtitle": "A Story",
                        "author": "A. Writer",
                        "publisher": "A Press",
                        "date": "2026-09-02",
                    },
                ),
                storydoc.contents(),
                storydoc.Cell(storydoc.BLURB, "A lantern, and a stair."),
                storydoc.chapter("One"),
                storydoc.markdown("prose"),
                storydoc.Cell(storydoc.ABOUT, "I live by the sea."),
            ],
        )

    def test_writes_the_epub_beside_the_document(self) -> None:
        self._ready()
        client = TestClient(app)
        response = client.post("/export/epub", json={"path": str(self.document)})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ready"])

        written = Path(response.json()["path"])
        self.assertEqual(written, self.document.with_suffix(".epub"))
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))

    def test_a_document_that_is_not_ready_is_not_bound(self) -> None:
        # The document written in setUp has a title page and nothing else: no
        # cover, no blurb, no author page, and a title page with one field on it.
        client = TestClient(app)
        response = client.post("/export/epub", json={"path": str(self.document)})
        self.assertEqual(response.status_code, 200)

        said = response.json()
        self.assertFalse(said["ready"])
        self.assertNotIn("path", said)
        self.assertFalse(self.document.with_suffix(".epub").exists())

    def test_it_says_what_is_missing_rather_than_only_refusing(self) -> None:
        client = TestClient(app)
        said = client.post(
            "/export/epub", json={"path": str(self.document)}
        ).json()
        self.assertEqual(
            said["added"], [storydoc.COVER, storydoc.CONTENTS, storydoc.BLURB, storydoc.ABOUT]
        )
        wanting = {item["kind"]: item["needs"] for item in said["wanting"]}
        # The title page is there, in place, and still not filled in — which is
        # the fault a document can have while looking complete.
        self.assertEqual(
            wanting[storydoc.TITLE_PAGE],
            ["subtitle", "author", "publisher", "date"],
        )

    def test_force_binds_a_book_that_is_not_ready(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/export/epub", json={"path": str(self.document), "force": True}
        )
        self.assertEqual(response.status_code, 200)

        said = response.json()
        self.assertFalse(said["ready"])
        written = Path(said["path"])
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))


# What the stubbed Gemini answers with: a plausible correction of the sections
# in the document below, rather than a token that the length check refuses.
CORRECTED = "The door had swung open."


def wait_for_style(client: TestClient, job_id: str, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get("/fix/style/status", params={"id": job_id})
        if response.status_code == 200 and not response.json()["running"]:
            return response.json()
        time.sleep(0.005)
    raise AssertionError(f"style job {job_id} did not finish within {timeout}s")


class FixStyle(unittest.TestCase):
    """The pass that goes to Gemini rather than to a model on this machine.

    Gemini itself is stood in for: what is under test is the job around it — that
    the key is required, that the corrected sections come back named by the cell
    they belong to, and that the file is not written.
    """

    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.document = Path(self._dir.name) / f"story{storydoc.EXTENSION}"
        self.written = storydoc.dumps(
            [
                storydoc.Cell(storydoc.TITLE_PAGE, "", {"title": "Veriona"}),
                storydoc.chapter("One"),
                storydoc.markdown("The lantern had gone out."),
                storydoc.chapter("Two"),
                storydoc.markdown("The door stood open."),
            ]
        )
        self.document.write_text(self.written, encoding="utf-8")
        app.state.jobs = ParallelJobsManager()

        self.model = mock.MagicMock()
        # About as long as the sections it replaces, and ending where a sentence
        # ends. A stub any shorter is refused by the checks that keep a chapter
        # cut off mid-answer out of the document, which is as it should be.
        self.model.complete.return_value = CORRECTED
        patched = mock.patch(
            "server.api.Gemini", return_value=self.model
        )
        self.gemini = patched.start()
        self.addCleanup(patched.stop)
        # A key in the environment would answer for a request that carried none,
        # which is the case these tests are about.
        cleared = mock.patch.dict(os.environ, {}, clear=False)
        cleared.start()
        os.environ.pop("GEMINI_API_KEY", None)
        self.addCleanup(cleared.stop)

    def start(self, **asked: object) -> dict:
        client = TestClient(app)
        started = client.post(
            "/fix/style", json={"path": str(self.document), "key": "k", **asked}
        )
        self.assertEqual(started.status_code, 202)
        return wait_for_style(client, started.json()["id"])

    def test_hands_back_each_corrected_section_by_the_cell_it_belongs_to(self) -> None:
        status = self.start()
        self.assertIsNone(status["error"])
        self.assertEqual(
            status["sections"],
            [
                {"index": 2, "source": CORRECTED},
                {"index": 4, "source": CORRECTED},
            ],
        )
        self.assertEqual(status["progress"], {"written": 2, "chapters": 2})

    def test_leaves_the_document_alone(self) -> None:
        self.start()
        self.assertEqual(self.document.read_text(), self.written)

    def test_opens_gemini_with_the_key_and_model_the_editor_sent(self) -> None:
        self.start(model="gemini-flash")
        self.assertEqual(self.gemini.call_args.args[:2], ("k", "gemini-flash"))

    def test_the_client_can_tell_when_the_job_has_been_stopped(self) -> None:
        # It waits out rate limits, and an author who pressed stop should not be
        # made to wait out one too.
        self.start()
        self.assertTrue(callable(self.gemini.call_args.kwargs["cancelled"]))

    def test_a_request_with_no_key_anywhere_asks_the_author_to_sign_in(self) -> None:
        client = TestClient(app)
        response = client.post("/fix/style", json={"path": str(self.document)})
        self.assertEqual(response.status_code, 401)

    def test_the_environment_answers_for_a_server_somebody_started(self) -> None:
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "from-the-shell"}):
            client = TestClient(app)
            started = client.post("/fix/style", json={"path": str(self.document)})
        self.assertEqual(started.status_code, 202)
        wait_for_style(client, started.json()["id"])
        self.assertEqual(self.gemini.call_args.args[0], "from-the-shell")

    def test_names_the_chapters_it_left_as_the_author_wrote_them(self) -> None:
        # A chapter the pass could not use an answer for is left alone, which is
        # right and is invisible — the document looks as it would if the chapter
        # had needed nothing. The editor is told so it can say so.
        self.model.complete.side_effect = [
            'She reached for it and said, "Come closer',
            CORRECTED,
        ]
        status = self.start()
        self.assertEqual(status["sections"], [{"index": 4, "source": CORRECTED}])
        self.assertEqual(len(status["leftAlone"]), 1)
        self.assertEqual(status["leftAlone"][0]["chapter"], "One")
        self.assertIn("mid-sentence", status["leftAlone"][0]["why"])

    def test_a_missing_document_is_a_bad_request(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/fix/style",
            json={"path": str(self.document.with_name("nope.author")), "key": "k"},
        )
        self.assertEqual(response.status_code, 400)

    def test_asking_after_a_job_nobody_started_is_a_miss(self) -> None:
        client = TestClient(app)
        response = client.get("/fix/style/status", params={"id": "nothing"})
        self.assertEqual(response.status_code, 404)

    def test_a_document_with_no_chapters_fails_the_job_rather_than_the_request(
        self,
    ) -> None:
        self.document.write_text(
            storydoc.dumps([storydoc.markdown("Just prose.")]), encoding="utf-8"
        )
        status = self.start()
        self.assertIn("no chapters", status["error"])

    def test_a_signed_in_key_is_checked_before_it_is_used(self) -> None:
        client = TestClient(app)
        self.assertEqual(
            client.post("/auth/gemini", json={"key": "k"}).json(),
            {"ok": True, "detail": None},
        )
        self.model.verify.assert_called_once()

    def test_a_key_gemini_refuses_is_reported_rather_than_raised(self) -> None:
        self.model.verify.side_effect = GeminiError("Gemini refused (400)")
        client = TestClient(app)
        answer = client.post("/auth/gemini", json={"key": "no"}).json()
        self.assertFalse(answer["ok"])
        self.assertIn("refused", answer["detail"])


if __name__ == "__main__":
    unittest.main()
