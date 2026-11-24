from collections.abc import AsyncIterator
from pathlib import Path
import asyncio
import unittest
from unittest import mock

from cortexgrid_infer import CompletionChunk
from fastapi.testclient import TestClient

from server.api import app, ParallelJobsManager
from server.jobs import Job


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


if __name__ == "__main__":
    unittest.main()
