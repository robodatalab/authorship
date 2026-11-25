from collections.abc import AsyncIterator
from pathlib import Path
import tempfile
import asyncio
import threading
import unittest
from unittest import mock

from cortexgrid_infer import CompletionChunk
from fastapi.testclient import TestClient

from server.api import app
from server.jobs import Job, ParallelJobsManager
from authordoc.storydoc import Document
from authordoc import storydoc
from authordoc.cells.blurb_cell import BLURB, BlurbCell
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.title_page_cell import TitlePageCell


DEFAULT_REPLY = (
    '{"nodes": [{"id": 1, "title": "scene", "start": 0, "end": 1}], "edges": []}'
)


async def streamed(reply: str) -> AsyncIterator[CompletionChunk]:
    yield CompletionChunk(content=reply)


def build_fake_completion_model(reply: str = DEFAULT_REPLY) -> mock.MagicMock:
    model = mock.MagicMock()
    model.complete.side_effect = lambda messages, **_: streamed(reply)
    return model


def build_fake_deployment(model: mock.MagicMock) -> mock.MagicMock:
    deployment = mock.MagicMock()
    deployment.client_async.return_value = model
    return deployment


def run_the_job_started() -> Job:
    job = app.state.jobs.start.call_args.args[0]
    executing = job.execute()
    asyncio.run(executing)
    return job


class GenerateBlurb(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.document = Path(self._dir.name) / f"story{storydoc.EXTENSION}"
        self.written = Document.from_cells(
            [
                TitlePageCell(title="Veriona"),
                ChapterCell("One"),
                MarkdownCell(_unique_id="lantern", source="The lantern had gone out."),
                ChapterCell("Two"),
                MarkdownCell(_unique_id="door", source="The door stood open."),
                BlurbCell(),
            ]
        ).text
        self.document.write_text(self.written, encoding="utf-8")

        def _restore_model():
            app.state.causal_deployment = None

        self.addCleanup(_restore_model)

        self.model = build_fake_completion_model(
            reply="A woman loses her name."
        )
        app.state.causal_deployment = build_fake_deployment(self.model)
        app.state.jobs = mock.create_autospec(ParallelJobsManager, instance=True)

    def test_runs_as_a_job_and_hands_the_blurb_back(self) -> None:
        started = TestClient(app).post(
            "/generate/blurb",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        job = run_the_job_started()

        self.assertEqual(started.status_code, 202)
        self.assertEqual(
            job.snapshot(),
            {
                "kind": BLURB,
                "text": "A woman loses her name.",
                "progress": {"written": 2, "chapters": 2},
            },
        )

    def test_leaves_the_document_alone(self) -> None:
        # The blurb comes back for the editor to place; a job that wrote it into
        # the file would be writing a cell the editor owns.
        TestClient(app).post(
            "/generate/blurb",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        run_the_job_started()

        self.assertEqual(self.document.read_text(), self.written)

    def test_asking_after_a_job_nobody_started_is_a_miss(self) -> None:
        app.state.jobs.get.return_value = None
        client = TestClient(app)
        response = client.get("/generate/status", params={"id": "nothing"})
        self.assertEqual(response.status_code, 404)

    def test_says_how_much_of_the_story_it_has_read_while_it_reads(self) -> None:
        # The one division the work has is chapters, and it is what the editor
        # draws its bar from — so it has to be answerable mid-job, not after.
        entered = threading.Semaphore(0)
        release = threading.Event()

        async def complete(*_args, **_kwargs) -> AsyncIterator[CompletionChunk]:
            entered.release()
            await asyncio.to_thread(release.wait, 5)
            yield CompletionChunk(content="A woman loses her name.")

        self.model.complete.side_effect = complete
        TestClient(app).post(
            "/generate/blurb",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        job = app.state.jobs.start.call_args.args[0]
        executing = job.execute()
        running = threading.Thread(target=asyncio.run, args=(executing,))
        running.start()
        self.assertTrue(entered.acquire(timeout=5))

        self.assertEqual(job.snapshot()["progress"], {"written": 0, "chapters": 2})

        release.set()
        running.join(5)
        self.assertEqual(job.snapshot()["progress"], {"written": 2, "chapters": 2})


if __name__ == "__main__":
    unittest.main()
