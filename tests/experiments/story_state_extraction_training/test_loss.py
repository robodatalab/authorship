import math
import unittest

import torch
from parameterized import parameterized

from experiments.story_state_extraction_training.loss import (
    ConceptEmbeddings,
    loss_for_uneven_distribution_of_related_examples_inside_sphere,
    radius_of_concept_sphere,
    salient_point_classification_loss,
)


class SalientPointClassificationLossTests(unittest.TestCase):
    @parameterized.expand([
        ("radius 1, unrelated example outside", 1.0, 2.0, 0.0),
        ("radius 1, unrelated example on the surface", 1.0, 1.0, 0.5),
        ("radius 1, unrelated example inside", 1.0, 0.5, 1.0),
        ("radius 2, unrelated example outside", 2.0, 2.0, 0.0),
        ("radius 2, unrelated example on the surface", 2.0, 1.0, 0.5),
        ("radius 2, unrelated example inside", 2.0, 0.5, 1.0),
        ("radius 10, unrelated example outside", 10.0, 2.0, 0.0),
        ("radius 10, unrelated example on the surface", 10.0, 1.0, 0.5),
        ("radius 10, unrelated example inside", 10.0, 0.5, 1.0),
    ])
    def test_loss_changes_as_unrelated_examples_cross_the_radius_of_concept_sphere(
        self, _, sphere_scale: float, distance_in_radii: float, expected_loss: float
    ) -> None:
        abstract = torch.tensor([0.0, 0.0])
        ranks = torch.arange(100, dtype=torch.float32)
        distances = sphere_scale * torch.sqrt((ranks + 0.5) / 100)
        angles = ranks * 2.399963
        related_examples = torch.stack([distances * torch.cos(angles), distances * torch.sin(angles)], dim=-1)
        radius = radius_of_concept_sphere(abstract, related_examples)
        unrelated_example = torch.tensor([[distance_in_radii * radius.item(), 0.0]])
        concept = ConceptEmbeddings(
            abstract=abstract,
            related_examples=related_examples,
            unrelated_examples=unrelated_example,
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
        (
            "the_examples_spread_evenly_to_the_edges_of_the_area",
            ConceptEmbeddings(
                abstract=torch.tensor([0.0, 1.0]),
                related_examples=torch.tensor([[1.0, 0.0], [0.0, 1.0], [-1.0, 0.0]]),
                unrelated_examples=torch.tensor([[0.0, -1.0]]),
            ),
        ),
    ])
    def test_loss_is_finite_and_positive(self, _, concept: ConceptEmbeddings) -> None:
        torch.manual_seed(0)

        loss = salient_point_classification_loss([concept])

        self.assertTrue(math.isfinite(loss.item()))
        self.assertGreaterEqual(loss.item(), 0.0)

    @parameterized.expand([
        ("1 example", 1, 1.75),
        ("2 examples", 2, 0.4),
        ("10 examples", 10, 0.0),
        ("100 examples", 100, 0.0),
    ])
    def test_uneven_distribution_loss_for_examples_spread_uniformly_through_the_sphere(
        self, _, example_count: int, expected_loss: float
    ) -> None:
        centre = torch.tensor([0.0, 0.0])
        ranks = torch.arange(example_count, dtype=torch.float32)
        distances = torch.sqrt((ranks + 0.5) / example_count)
        angles = ranks * 2.399963
        examples = torch.stack([distances * torch.cos(angles), distances * torch.sin(angles)], dim=-1)
        radius = radius_of_concept_sphere(centre, examples)

        loss = loss_for_uneven_distribution_of_related_examples_inside_sphere(examples, centre, radius)

        self.assertAlmostEqual(loss.item(), expected_loss, places=1)

    @parameterized.expand([
        ("1 example", 1, 1.75),
        ("2 examples", 2, 0.8),
        ("10 examples", 10, 0.3),
        ("100 examples", 100, 0.3),
    ])
    def test_uneven_distribution_loss_for_examples_only_on_the_surface_of_the_sphere(
        self, _, example_count: int, expected_loss: float
    ) -> None:
        centre = torch.tensor([0.0, 0.0])
        ranks = torch.arange(example_count, dtype=torch.float32)
        angles = ranks * 2 * math.pi / example_count
        examples = torch.stack([torch.cos(angles), torch.sin(angles)], dim=-1)
        radius = radius_of_concept_sphere(centre, examples)

        loss = loss_for_uneven_distribution_of_related_examples_inside_sphere(examples, centre, radius)

        self.assertAlmostEqual(loss.item(), expected_loss, places=1)

    @parameterized.expand([
        ("1 example", 1, 1.75),
        ("2 examples", 2, 1.65),
        ("10 examples", 10, 1.6),
        ("100 examples", 100, 1.6),
    ])
    def test_uneven_distribution_loss_for_examples_bunched_on_one_side_of_the_sphere(
        self, _, example_count: int, expected_loss: float
    ) -> None:
        centre = torch.tensor([0.0, 0.0])
        ranks = torch.arange(example_count, dtype=torch.float32)
        distances = 0.1 * torch.sqrt((ranks + 0.5) / example_count)
        angles = ranks * 2.399963
        examples = torch.stack([0.8 + distances * torch.cos(angles), distances * torch.sin(angles)], dim=-1)
        radius = radius_of_concept_sphere(centre, examples)

        loss = loss_for_uneven_distribution_of_related_examples_inside_sphere(examples, centre, radius)

        self.assertAlmostEqual(loss.item(), expected_loss, places=1)
