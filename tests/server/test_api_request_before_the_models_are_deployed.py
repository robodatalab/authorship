import unittest

from fastapi.testclient import TestClient

from server.api import app


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


if __name__ == "__main__":
    unittest.main()
