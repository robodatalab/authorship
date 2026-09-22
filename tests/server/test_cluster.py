import unittest
from unittest import mock

import cortexgrid

from server.models import cluster


def build_fake_importer() -> mock.MagicMock:
    importer = mock.MagicMock(family="Qwen3", suffix="8B")
    importer.config.return_value = {"enable_thinking": "true", "max_total_tokens": "4096"}
    return importer


class Deploy(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.models.cluster.cortexgrid",
            Experiment=mock.DEFAULT,
            remote=mock.DEFAULT,
            deploy_model=mock.DEFAULT,
        )
        self.cortexgrid = patched.start()
        self.addCleanup(patched.stop)
        self.cortexgrid["deploy_model"].return_value = mock.Mock(url="http://serve/Qwen3/8B")

    def test_imports_the_weights_on_the_cluster_before_deploying(self) -> None:
        importer = build_fake_importer()

        cluster.deploy(importer)

        job, *arguments = self.cortexgrid["remote"].call_args.args
        self.assertIs(job, cluster.import_weights)
        self.assertEqual(arguments[0], importer)
        self.assertEqual(arguments[1], importer.requirements.return_value)
        self.assertEqual(self.cortexgrid["remote"].call_args.kwargs["num_gpus"], 0)
        self.cortexgrid["remote"].return_value.result.assert_called_once()
        self.cortexgrid["deploy_model"].assert_called_once_with(
            "Qwen3",
            "8B",
            cortexgrid.IMPORTED,
            wait=True,
            timeout=cluster.DEPLOY_TIMEOUT_S,
        )

    def test_the_settings_given_override_the_serve_app_s_on_the_model_card(self) -> None:
        cluster.deploy(build_fake_importer(), enable_thinking="false")

        self.assertEqual(
            self.cortexgrid["remote"].call_args.args[3],
            {"enable_thinking": "false", "max_total_tokens": "4096"},
        )

    def test_answers_with_the_client_of_the_deployment(self) -> None:
        importer = build_fake_importer()

        client = cluster.deploy(importer)

        importer.client.assert_called_once_with("http://serve/Qwen3/8B")
        self.assertIs(client, importer.client.return_value)


if __name__ == "__main__":
    unittest.main()
