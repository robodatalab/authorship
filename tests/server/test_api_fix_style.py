from collections.abc import AsyncIterator
from pathlib import Path
import tempfile
import asyncio
import unittest
from unittest import mock

from cortexgrid_infer import CompletionChunk
from fastapi.testclient import TestClient

from server.api import app
from server.jobs import Job, ParallelJobsManager
from authordoc.storydoc import Document
from authordoc import storydoc
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


# What the stubbed model answers with: a plausible correction of the sections
# in the document below, rather than a token that the length check refuses.
CORRECTED = "The door had swung open."


class FixStyle(unittest.TestCase):
    """The pass over the manuscript, against a model stood in for here.

    What is under test is the job around it: that the corrected sections come
    back named by the cell they belong to, and that the file is not written.
    """

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
            ]
        ).text
        self.document.write_text(self.written, encoding="utf-8")
        app.state.jobs = mock.create_autospec(ParallelJobsManager, instance=True)

        # About as long as the sections it replaces, and ending where a sentence
        # ends. A stub any shorter is refused by the checks that keep a chapter
        # cut off mid-answer out of the document, which is as it should be.
        self.model = build_fake_completion_model(CORRECTED)
        app.state.style_deployment = build_fake_deployment(self.model)

    def start(self) -> Job:
        started = TestClient(app).post(
            "/fix/style",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        self.assertEqual(started.status_code, 202)
        job = run_the_job_started()
        return job

    def test_hands_back_each_corrected_section_by_the_cell_it_belongs_to(self) -> None:
        job = self.start()
        self.assertEqual(
            job.snapshot(),
            {
                "leftAlone": [],
                "sections": [
                    {"cellId": "lantern", "source": CORRECTED},
                    {"cellId": "door", "source": CORRECTED},
                ],
                "progress": {"fixed": 2, "sections": 2},
            },
        )

    def test_leaves_the_document_alone(self) -> None:
        self.start()
        self.assertEqual(self.document.read_text(), self.written)

    def test_names_the_sections_it_left_as_the_author_wrote_them(self) -> None:
        # A section the pass could not use an answer for is left alone, which is
        # right and is invisible — the document looks as it would if the section
        # had needed nothing. The editor is told so it can say so.
        answers = iter(['She reached for it and said, "Come closer', CORRECTED])
        self.model.complete.side_effect = lambda messages, **_: streamed(next(answers))
        snapshot = self.start().snapshot()
        self.assertEqual(snapshot["sections"], [{"cellId": "door", "source": CORRECTED}])
        self.assertEqual(len(snapshot["leftAlone"]), 1)
        self.assertEqual(snapshot["leftAlone"][0]["opening"], "The lantern had gone out.")
        self.assertIn("mid-sentence", snapshot["leftAlone"][0]["why"])

    def test_asking_after_a_job_nobody_started_is_a_miss(self) -> None:
        app.state.jobs.get.return_value = None
        client = TestClient(app)
        response = client.get("/fix/style/status", params={"id": "nothing"})
        self.assertEqual(response.status_code, 404)

    def test_a_document_with_no_prose_fails_the_job_rather_than_the_request(
        self,
    ) -> None:
        self.document.write_text(
            Document.from_cells([ChapterCell("One")]).text, encoding="utf-8"
        )
        with self.assertRaisesRegex(ValueError, "no prose"):
            self.start()


if __name__ == "__main__":
    unittest.main()
