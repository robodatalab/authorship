import unittest
from unittest import mock

import cortexgrid

from server.models import cluster
from server.models.causal_event_trajectory_classifier import (
    CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY,
    CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX,
    CausalEventTrajectoryClassifier,
    deploy_causal_event_trajectory_classifier,
)


class DeployingTheClassifier(unittest.TestCase):
    def setUp(self) -> None:
        patched = mock.patch.multiple(
            "server.models.causal_event_trajectory_classifier.cortexgrid",
            register_model=mock.DEFAULT,
            deploy_model=mock.DEFAULT,
        )
        self.cortexgrid = patched.start()
        self.addCleanup(patched.stop)

    def test_is_registered_under_its_own_name_with_no_weights_of_its_own(self) -> None:
        deploy_causal_event_trajectory_classifier()

        self.cortexgrid["register_model"].assert_called_once_with(
            CausalEventTrajectoryClassifier,
            family=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY,
            suffix=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX,
            requirements=CausalEventTrajectoryClassifier.requirements(),
        )

    def test_is_deployed_from_the_registry(self) -> None:
        deployment = deploy_causal_event_trajectory_classifier()

        self.cortexgrid["deploy_model"].assert_called_once_with(
            family=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY,
            suffix=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX,
            run_name=cortexgrid.IMPORTED,
            timeout=cluster.DEPLOY_TIMEOUT_S,
        )
        self.assertIs(deployment, self.cortexgrid["deploy_model"].return_value)


if __name__ == "__main__":
    unittest.main()
