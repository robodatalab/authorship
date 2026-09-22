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
        self.cortexgrid["deploy_model"].return_value = mock.Mock(
            url="http://serve/Qwen3/8B"
        )

    def test_imports_the_weights_on_the_cluster_before_deploying(self) -> None:
        importer = build_fake_importer()

        cluster.deploy(importer)

        job, *arguments = self.cortexgrid["remote"].call_args.args
        self.assertIs(job, cluster.import_weights)
        self.assertEqual(arguments[0], importer)
        self.assertEqual(arguments[1], importer.requirements.return_value)
        self.assertEqual(arguments[2], importer.config.return_value)
        self.assertEqual(self.cortexgrid["remote"].call_args.kwargs["num_gpus"], 0)
        self.cortexgrid["remote"].return_value.result.assert_called_once()
        self.cortexgrid["deploy_model"].assert_called_once_with(
            family="Qwen3",
            suffix="8B",
            run_name=cortexgrid.IMPORTED,
            wait=True,
            timeout=cluster.DEPLOY_TIMEOUT_S,
            config={},
        )

    def test_the_settings_given_are_this_deployment_s_own(self) -> None:
        cluster.deploy(build_fake_importer(), enable_thinking="false")

        self.assertEqual(
            self.cortexgrid["deploy_model"].call_args.kwargs["config"],
            {"enable_thinking": "false"},
        )

    def test_answers_with_the_deployment(self) -> None:
        deployment = cluster.deploy(build_fake_importer())

        self.assertIs(deployment, self.cortexgrid["deploy_model"].return_value)


if __name__ == "__main__":
    unittest.main()
