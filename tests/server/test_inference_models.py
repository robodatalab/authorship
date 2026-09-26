import threading
import unittest
from unittest import mock

from server.models.inference_models import (
    CAUSAL_MODEL,
    GEC_MODEL,
    deploy_inference_models,
)
from server.story_analysis.causal_event_trajectory_classifier import (
    CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_BASE_MODEL,
)

DISTINCT_MODELS_TO_IMPORT = {CAUSAL_MODEL, GEC_MODEL, CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_BASE_MODEL}


def build_fake_importer(model_id: str, *_: object) -> mock.MagicMock:
    return mock.MagicMock(model_id=model_id)


class DeployingTheInferenceModels(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.models.inference_models",
            cortexgrid=mock.DEFAULT,
            cluster=mock.DEFAULT,
            Hosted=mock.DEFAULT,
            HuggingFaceImporter=mock.DEFAULT,
            deploy_causal_event_trajectory_classifier=mock.DEFAULT,
            CausalEventTrajectoryClassifier=mock.DEFAULT,
        )
        self.patched = patched.start()
        self.addCleanup(patched.stop)
        self.patched["HuggingFaceImporter"].side_effect = build_fake_importer
        self.app = mock.MagicMock()
        self.app.state.inference_models = {}

    def test_imports_each_model_once_even_when_deployments_share_it(self) -> None:
        deploy_inference_models(self.app)

        imported = [
            call.args[0].model_id
            for call in self.patched["cluster"].ensure_weights_imported.call_args_list
        ]
        self.assertCountEqual(imported, DISTINCT_MODELS_TO_IMPORT)

    def test_the_imports_run_together(self) -> None:
        together = threading.Barrier(len(DISTINCT_MODELS_TO_IMPORT), timeout=5)
        self.patched["cluster"].ensure_weights_imported.side_effect = (
            lambda importer: together.wait()
        )

        deploy_inference_models(self.app)


if __name__ == "__main__":
    unittest.main()
