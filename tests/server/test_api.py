from collections.abc import AsyncIterator
from pathlib import Path
import tempfile
import asyncio
import threading
import unittest
import zipfile
from unittest import mock

import cortexgrid
from cortexgrid_infer import CompletionChunk
from fastapi.testclient import TestClient

from server.api import app, ParallelJobsManager
from server.jobs import Job
from authordoc.storydoc import Document
from authordoc import storydoc
from authordoc.cells.about_cell import ABOUT, AboutCell
from authordoc.cells.blurb_cell import BLURB, BlurbCell
from authordoc.cells.chapter_cell import ChapterCell
from authordoc.cells.image_cell import ImageCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.recap_cell import RECAP, RecapCell
from authordoc.cells.table_of_contents_cell import (
    TABLE_OF_CONTENTS,
    TableOfContentsCell,
)
from authordoc.cells.title_page_cell import TITLE_PAGE, TitlePageCell


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


class Health(unittest.TestCase):
    def test_answers_while_the_server_is_up(self) -> None:
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)


class Models(unittest.TestCase):
    def test_lists_each_model_with_its_serving_phase_on_the_cluster(self) -> None:
        serving = cortexgrid.DeploymentKey("Qwen3", "8B", cortexgrid.IMPORTED)
        deploying = cortexgrid.DeploymentKey("gec", "t5_small", cortexgrid.IMPORTED)
        app.state.inference_models = {
            "Qwen/Qwen3-8B": serving,
            "Unbabel/gec-t5_small": deploying,
        }
        phases = {serving: "running", deploying: "deploying"}

        with mock.patch(
            "server.api.cortexgrid.model_serving_status",
            side_effect=lambda key: mock.Mock(phase=phases[key]),
        ) as serving_status:
            response = TestClient(app).get("/models")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "models": [
                    {"model": "Qwen/Qwen3-8B", "status": "running"},
                    {"model": "Unbabel/gec-t5_small", "status": "deploying"},
                ]
            },
        )
        serving_status.assert_any_call(serving)
        serving_status.assert_any_call(deploying)


class RequestBeforeTheModelsAreDeployed(unittest.TestCase):
    def test_is_told_the_models_are_still_being_deployed(self) -> None:
        app.state.causal_deployment = None

        response = TestClient(app).post(
            "/generate/blurb", json={"path": "manuscript.author", "text": ""}
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(), {"detail": "The models are still being deployed"}
        )


def run_the_job_started() -> Job:
    job = app.state.jobs.start.call_args.args[0]
    executing = job.execute()
    asyncio.run(executing)
    return job


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


class ExportEpub(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.document = Path(self._dir.name) / f"story{storydoc.EXTENSION}"
        Document.from_cells(
            [
                TitlePageCell(title="Book"),
                ChapterCell("One"),
                MarkdownCell("prose"),
            ],
            self.document,
        ).save()

    def _ready(self) -> None:
        """Write the document out with every section a book needs filled in."""
        (Path(self._dir.name) / "art.png").write_bytes(b"png")
        Document.from_cells(
            [
                ImageCell("art.png"),
                TitlePageCell(title="Book", subtitle="A Story", author="A. Writer", publisher="A Press", date="2026-09-02"),
                TableOfContentsCell(),
                BlurbCell(source="A lantern, and a stair."),
                ChapterCell("One"),
                MarkdownCell("prose"),
                AboutCell(source="I live by the sea."),
            ],
            self.document,
        ).save()

    def test_writes_the_epub_beside_the_document(self) -> None:
        self._ready()
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ready"])

        written = Path(response.json()["path"])
        self.assertEqual(written, self.document.with_suffix(".epub"))
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))

    def test_a_document_that_is_not_ready_is_not_bound(self) -> None:
        # The document written in setUp has a title page and nothing else: no
        # blurb, no author page, and a title page with one field on it.
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={"path": str(self.document), "text": self.document.read_text()},
        )
        self.assertEqual(response.status_code, 200)

        said = response.json()
        self.assertFalse(said["ready"])
        self.assertIsNone(said["path"])
        self.assertFalse(self.document.with_suffix(".epub").exists())

    def test_it_says_what_is_missing_rather_than_only_refusing(self) -> None:
        client = TestClient(app)
        said = client.post(
            "/export/epub",
            json={"path": str(self.document), "text": self.document.read_text()},
        ).json()
        self.assertEqual(
            said["added"], [TABLE_OF_CONTENTS, BLURB, ABOUT]
        )
        wanting = {item["kind"]: item["needs"] for item in said["wanting"]}
        # The title page is there, in place, and still not filled in — which is
        # the fault a document can have while looking complete.
        self.assertEqual(
            wanting[TITLE_PAGE],
            ["subtitle", "author", "publisher", "date"],
        )

    def test_force_binds_a_book_that_is_not_ready(self) -> None:
        client = TestClient(app)
        response = client.post(
            "/export/epub",
            json={
                "path": str(self.document),
                "text": self.document.read_text(),
                "force": True,
            },
        )
        self.assertEqual(response.status_code, 200)

        said = response.json()
        self.assertFalse(said["ready"])
        written = Path(said["path"])
        self.assertTrue(written.exists())
        self.assertTrue(zipfile.is_zipfile(written))


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


class StoryGenerationStage(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.document = Path("/stories/story.author")
        app.state.jobs = mock.create_autospec(ParallelJobsManager, instance=True)

        def _restore_model():
            app.state.writing_deployment = None

        self.addCleanup(_restore_model)

    def test_runs_the_stage_it_is_given_and_asks_the_author_to_review_it(self) -> None:
        model = build_fake_completion_model()
        app.state.writing_deployment = build_fake_deployment(model)

        started = TestClient(app).post(
            "/generate/story",
            json={"path": str(self.document), "story": "", "stage": "concept titles"},
        )
        job = run_the_job_started()

        self.assertEqual(started.status_code, 202)
        self.assertEqual(
            job.snapshot()["asked"],
            {
                "stage": "concept titles",
                "story": "",
                "shown": {
                    "kind": "command",
                    "cellKind": "salient-concept",
                    "commandName": "insertCell",
                },
            },
        )

    def test_runs_the_stage_on_the_story_the_editor_sends(self) -> None:
        model = build_fake_completion_model("### Motherhood\nA mother's care.")
        app.state.writing_deployment = build_fake_deployment(model)

        TestClient(app).post(
            "/generate/story",
            json={
                "path": str(self.document),
                "story": '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n',
                "stage": "concepts",
            },
        )
        job = run_the_job_started()

        self.assertEqual(
            job.snapshot()["asked"],
            {
                "stage": "concepts",
                "story": '<!-- cell: salient-concept id="k1" title="Motherhood" -->\n\n'
                "A mother's care.\n",
                "shown": {"kind": "cells", "cellKind": "salient-concept"},
            },
        )

    def test_a_stage_it_does_not_know_is_refused(self) -> None:
        model = build_fake_completion_model()
        app.state.writing_deployment = build_fake_deployment(model)

        response = TestClient(app).post(
            "/generate/story",
            json={"path": str(self.document), "story": "", "stage": "epilogue"},
        )

        self.assertEqual(response.status_code, 400)

    def test_a_story_no_stage_ran_on_has_no_story_generation(self) -> None:
        app.state.jobs.get.return_value = None

        response = TestClient(app).get("/generate/story/status", params={"id": str(self.document)})

        self.assertEqual(response.status_code, 404)
