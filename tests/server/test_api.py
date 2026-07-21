import asyncio
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock

from fastapi.testclient import TestClient
import httpx

from server.api import app
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

        self.original_model = getattr(app.state, "completion_model", None)

        def _restore_model():
            app.state.completion_model = self.original_model

        self.addCleanup(_restore_model)

        self.model = build_fake_completion_model()
        app.state.completion_model = self.model

    def test_backs_off_while_the_model_is_loading(self) -> None:
        self.model.complete.side_effect = [
            ModelNotAvailable("loading"),
            ModelNotAvailable("loading"),
            DEFAULT_REPLY,
        ]
        client = TestClient(app, raise_server_exceptions=False)
        with mock.patch("time.sleep"):
            response = client.post("/build", json={"path": self.manuscript_paths[0]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["layers"], [{"nodes": 1, "edges": 0}])

    def test_multiple_builds_for_different_files_can_run_in_parallel(self) -> None:
        barrier = threading.Barrier(2)

        def rendezvous(*_args, **_kwargs) -> str:
            barrier.wait(timeout=5)
            return DEFAULT_REPLY

        self.model.complete.side_effect = rendezvous

        async def build_both():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                return await asyncio.gather(
                    *(
                        client.post("/build", json={"path": p})
                        for p in self.manuscript_paths
                    )
                )

        responses = asyncio.run(build_both())

        for response in responses:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["layers"], [{"nodes": 1, "edges": 0}])

    def test_a_second_build_for_the_same_file_supersedes_the_first(self) -> None:
        barrier = threading.Barrier(2)

        def rendezvous(*_args, **_kwargs) -> str:
            barrier.wait(timeout=5)
            return DEFAULT_REPLY

        self.model.complete.side_effect = rendezvous

        async def build_both():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                return await asyncio.gather(
                    *(
                        client.post("/build", json={"path": self.manuscript_paths[0]})
                        for _ in range(2)
                    )
                )

        responses = asyncio.run(build_both())
        self.assertEqual(responses[0].status_code, 403)
        self.assertEqual(responses[1].status_code, 200)


if __name__ == "__main__":
    unittest.main()
