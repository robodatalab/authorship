import asyncio
import unittest
from unittest import mock

import cortexgrid
import httpx
from tenacity import wait_none

from server.jobs import the_job_in_hand
from server.models import cluster


def build_fake_importer() -> mock.MagicMock:
    importer = mock.MagicMock(family="Qwen3", suffix="8B")
    importer.config.return_value = {"enable_thinking": "true", "max_total_tokens": "4096"}
    return importer


@cluster.waiting_for_the_model
async def asked_of_a_model(drops: list[BaseException]) -> str:
    if drops:
        raise drops.pop(0)
    return "answered"


class WaitingForTheModel(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        waiting = asked_of_a_model.retry.wait
        self.addCleanup(setattr, asked_of_a_model.retry, "wait", waiting)
        asked_of_a_model.retry.wait = wait_none()
        the_job_in_hand.set(None)

    def test_asks_again_while_the_deployment_is_not_there(self) -> None:
        drops = [
            httpx.RemoteProtocolError("peer closed connection"),
            httpx.HTTPStatusError(
                "no backend",
                request=httpx.Request("POST", "http://serve/complete"),
                response=httpx.Response(503),
            ),
        ]

        self.assertEqual(asyncio.run(asked_of_a_model(drops)), "answered")
        self.assertEqual(drops, [])

    def test_a_refusal_that_is_not_the_model_coming_up_is_raised(self) -> None:
        drops = [
            httpx.HTTPStatusError(
                "no such route",
                request=httpx.Request("POST", "http://serve/complete"),
                response=httpx.Response(404),
            )
        ]

        with self.assertRaises(httpx.HTTPStatusError):
            asyncio.run(asked_of_a_model(drops))

    def test_stops_asking_once_the_job_is_stopped(self) -> None:
        job = mock.Mock(cancelled=False)
        the_job_in_hand.set(job)
        self.addCleanup(the_job_in_hand.set, None)
        drops = [
            httpx.RemoteProtocolError("peer closed connection") for _ in range(5)
        ]

        async def stopped_after_the_first_drop() -> str:
            asking = asyncio.ensure_future(asked_of_a_model(drops))
            await asyncio.sleep(0)
            job.cancelled = True
            return await asking

        with self.assertRaises(httpx.RemoteProtocolError):
            asyncio.run(stopped_after_the_first_drop())
        self.assertTrue(drops, "it went on asking after the job was stopped")


class EnsureWeightsImported(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.models.cluster.cortexgrid",
            remote=mock.DEFAULT,
            model_registry_status=mock.DEFAULT,
        )
        self.cortexgrid = patched.start()
        self.addCleanup(patched.stop)

    def test_a_model_not_yet_imported_is_imported_on_the_cluster(self) -> None:
        self.cortexgrid["model_registry_status"].return_value = None
        importer = build_fake_importer()

        cluster.ensure_weights_imported(importer)

        job, *arguments = self.cortexgrid["remote"].call_args.args
        self.assertIs(job, cluster.import_weights)
        self.assertEqual(arguments[0], importer)
        self.assertEqual(arguments[1], importer.requirements.return_value)
        self.assertEqual(arguments[2], importer.config.return_value)
        self.assertEqual(self.cortexgrid["remote"].call_args.kwargs["num_gpus"], 0)
        self.cortexgrid["remote"].return_value.result.assert_called_once()

    def test_an_imported_model_is_refreshed_here_without_a_job_on_the_cluster(
        self,
    ) -> None:
        self.cortexgrid["model_registry_status"].return_value = mock.Mock(
            phase="ready"
        )
        importer = build_fake_importer()

        with mock.patch("server.models.cluster.import_weights") as import_weights:
            cluster.ensure_weights_imported(importer)

        self.cortexgrid["remote"].assert_not_called()
        import_weights.assert_called_once_with(
            importer,
            importer.requirements.return_value,
            importer.config.return_value,
        )


class Deploy(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.models.cluster.cortexgrid",
            remote=mock.DEFAULT,
            deploy_model=mock.DEFAULT,
        )
        self.cortexgrid = patched.start()
        self.addCleanup(patched.stop)
        self.cortexgrid["deploy_model"].return_value = mock.Mock(
            url="http://serve/Qwen3/8B"
        )

    def test_deploys_the_imported_model_without_importing_it(self) -> None:
        cluster.deploy(build_fake_importer())

        self.cortexgrid["remote"].assert_not_called()
        self.cortexgrid["deploy_model"].assert_called_once_with(
            family="Qwen3",
            suffix="8B",
            run_name=cortexgrid.IMPORTED,
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
