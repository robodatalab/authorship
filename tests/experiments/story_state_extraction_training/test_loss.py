import math
import unittest

import torch
from parameterized import parameterized

from experiments.story_state_extraction_training.loss import (
    ConceptEmbeddings,
    salient_point_classification_loss,
)


class SalientPointClassificationLossTests(unittest.TestCase):
    @parameterized.expand([
        ("unrelated example outside", [0.0, 0.0], [1.0, 0.0], [0.0, -2.0], 0.0),
        ("unrelated example on the surface", [0.0, 0.0], [1.0, 0.0], [1.0, 0.0], 0.5),
        ("unrelated example inside", [0.0, 0.0], [1.0, 0.0], [0.0, 0.5], 1.0),
    ])
    def test_loss_changes_as_unrelated_examples_cross_the_radius_of_concept_sphere(
        self, _, abstract, related_examples, unrelated_example: list[float], expected_loss: float
    ) -> None:
        torch.manual_seed(0)
        concept = ConceptEmbeddings(
            abstract=torch.tensor(abstract),
            related_examples=torch.tensor([related_examples]),
            unrelated_examples=torch.tensor([unrelated_example]),
        )

        loss = salient_point_classification_loss([concept])

        self.assertAlmostEqual(loss.item(), expected_loss, places=1)

    @parameterized.expand([
        (
            "the_related_examples_far_away",
            ConceptEmbeddings(
                abstract=torch.tensor([0.0, 0.0]),
                related_examples=torch.tensor([[1e+8, 0.0]]),
                unrelated_examples=torch.tensor([[1.0, 0.0]]),
            ),
        ),
        (
            "the_unrelated_example_far_away",
            ConceptEmbeddings(
                abstract=torch.tensor([0.0, 0.0]),
                related_examples=torch.tensor([[1.0, 0.0]]),
                unrelated_examples=torch.tensor([[1e+8, 0.]]),
            ),
        ),
        (
            "the_abstract_far_away",
            ConceptEmbeddings(
                abstract=torch.tensor([1e+8, 0.0]),
                related_examples=torch.tensor([[1.0, 0.0]]),
                unrelated_examples=torch.tensor([[1.0, 0.0]]),
            ),
        ),
    ])
    def test_loss_is_finite_and_positive(self, _, concept: ConceptEmbeddings) -> None:
        torch.manual_seed(0)

        loss = salient_point_classification_loss([concept])

        self.assertTrue(math.isfinite(loss.item()))
        self.assertGreaterEqual(loss.item(), 0.0)

    def test_