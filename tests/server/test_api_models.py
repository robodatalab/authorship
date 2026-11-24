import unittest
from unittest import mock

import cortexgrid
from fastapi.testclient import TestClient

from server.api import app


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


if __name__ == "__main__":
    unittest.main()
