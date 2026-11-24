from collections.abc import AsyncIterator
from pathlib import Path
import tempfile
import asyncio
import unittest
from unittest import mock

from cortexgrid_infer import CompletionChunk
from fastapi.testclient import TestClient

from server.api import app, ParallelJobsManager
from server.jobs import Job
from authordoc.storydoc import Document
from authordoc import storydoc
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.recap_cell import RECAP, RecapCell
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
        Document.from_cells(
            [
                TitlePageCell(title="Veriona III"),
                RecapCell(documents="a.author, b.author"),
                ChapterCell("One"),
                MarkdownCell("The road ended at a gate."),
            ],
            self.document,
        ).save()
        self.written = self.document.read_text()
        for name, title, prose in [
            ("a.author", "Veriona", "The lantern had gone out."),
            ("b.author", "Veriona II", "The door stood open."),
        ]:
            Document.from_cells(
                [
                    TitlePageCell(title=title),
                    ChapterCell("One"),
                    MarkdownCell(prose),
                ],
                self.folder / name,
            ).save()

        def _restore_model():
            app.state.causal_deployment = None

        self.addCleanup(_restore_model)

        self.model = build_fake_completion_model(
            reply="She has lost her name."
        )
        app.state.causal_deployment = build_fake_deployment(self.model)
        app.state.jobs = mock.create_autospec(ParallelJobsManager, instance=True)

    def start(self, *documents: str):
        return TestClient(app).post(
            "/generate/recap",
            json={
                "path": str(self.document),
                "text": self.document.read_text(),
                "documents": list(documents),
            },
        )

    def test_runs_as_a_job_and_hands_the_story_so_far_back(self) -> None:
        started = self.start("a.author", "b.author")
        job = run_the_job_started()

        self.assertEqual(started.status_code, 202)
        self.assertEqual(
            job.snapshot(),
            {
                "kind": RECAP,
                "text": "She has lost her name.",
                "progress": {"written": 2, "chapters": 2},
            },
        )

    def test_says_which_section_is_being_written(self) -> None:
        # A document may hold a blurb and a story so far, and only one of them
        # asked — so the editor is told which cell the answer belongs in.
        self.start("a.author")
        job = run_the_job_started()
        self.assertEqual(job.snapshot()["kind"], RECAP)

    def test_the_documents_are_named_beside_the_one_that_asks(self) -> None:
        # A relative path is what the section carries, so the story survives being
        # moved, checked out somewhere else, or written on another machine.
        self.start("a.author")
        run_the_job_started()
        said = self.model.complete.call_args_list[0].args[0][1]["content"]
        self.assertIn("The lantern had gone out.", said)

    def test_leaves_every_document_alone(self) -> None:
        # The recap comes back for the editor to place, exactly as a blurb does.
        self.start("a.author", "b.author")
        run_the_job_started()
        self.assertEqual(self.document.read_text(), self.written)

    def test_a_section_naming_no_documents_is_a_bad_request(self) -> None:
        # Nothing to read is not an empty recap; it is a section nobody filled in.
        self.assertEqual(self.start().status_code, 400)

    def test_a_document_that_is_not_there_is_a_bad_request(self) -> None:
        # Said before the model is loaded rather than a minute into the reading.
        self.assertEqual(self.start("a.author", "gone.author").status_code, 400)


if __name__ == "__main__":
    unittest.main()
