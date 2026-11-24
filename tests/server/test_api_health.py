import unittest

from fastapi.testclient import TestClient

from server.api import app


class Health(unittest.TestCase):
    def test_answers_while_the_server_is_up(self) -> None:
        response = TestClient(app).get("/health")
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
