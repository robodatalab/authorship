from __future__ import annotations

from dataclasses import dataclass

import torch

SURFACE_STEEPNESS = 50.0


@dataclass(frozen=True)
class ConceptEmbeddings:
    abstract: torch.Tensor
    related_examples: torch.Tensor
    unrelated_examples: torch.Tensor


def radius_of_concept_sphere(abstract: torch.Tensor, related_examples: torch.Tensor) -> torch.Tensor:
    offsets = related_examples - abstract
    distances = offsets.norm(dim=-1)
    radius = distances.max()
    return radius


def probabilities_inside_sphere(
    embeddings: torch.Tensor, centre: torch.Tensor, radius: torch.Tensor
) -> torch.Tensor:
    offsets = embeddings - centre
    squared_distances = offsets.pow(2).sum(dim=-1)
    margins = radius.pow(2) - squared_distances
    steep_margins = SURFACE_STEEPNESS * margins
    probabilities = torch.sigmoid(steep_margins)
    return probabilities


def loss_for_related_examples_inside_sphere(
    embeddings: torch.Tensor, centre: torch.Tensor, radius: torch.Tensor
) -> torch.Tensor:
    probabilities_inside = probabilities_inside_sphere(embeddings, centre, radius)
    probabilities_outside = 1 - probabilities_inside
    loss = probabilities_outside.mean()
    return loss


def loss_for_unrelated_examples_outside_sphere(
    embeddings: torch.Tensor, centre: torch.Tensor, radius: torch.Tensor
) -> torch.Tensor:
    probabilities_inside = probabilities_inside_sphere(embeddings, centre, radius)
    loss = probabilities_inside.mean()
    return loss


def loss_for_uneven_distribution_of_related_examples_inside_sphere(
    embeddings: torch.Tensor, centre: torch.Tensor, radius: torch.Tensor
) -> torch.Tensor:
    example_count = embeddings.shape[0]
    dimensions = embeddings.shape[-1]
    offsets = embeddings - centre
    distances = offsets.norm(dim=-1)
    directions = torch.nn.functional.normalize(offsets, dim=-1)

    mean_direction = directions.mean(dim=0)
    rayleigh_imbalance = mean_direction.pow(2).sum()

    scatter = directions.T @ directions / example_count
    isotropic_scatter = torch.eye(dimensions, dtype=embeddings.dtype, device=embeddings.device) / dimensions
    scatter_difference = scatter - isotropic_scatter
    bingham_anisotropy = scatter_difference.pow(2).sum()

    relative_distances = distances / radius
    radial_fractions = relative_distances.pow(dimensions)
    sorted_radial_fractions = torch.sort(radial_fractions)
    ranks = torch.arange(example_count, dtype=embeddings.dtype, device=embeddings.device)
    evenly_spaced_fractions = (ranks + 0.5) / example_count
    radial_differences = sorted_radial_fractions.values - evenly_spaced_fractions
    radial_unevenness = radial_differences.pow(2).mean()

    loss = rayleigh_imbalance + bingham_anisotropy + radial_unevenness
    return loss


def salient_point_classification_loss(concepts: list[ConceptEmbeddings]) -> torch.Tensor:

    def concept_loss(concept: ConceptEmbeddings) -> torch.Tensor:
        radius = radius_of_concept_sphere(concept.abstract, concept.related_examples)
        loss_1 = loss_for_related_examples_inside_sphere(concept.related_examples, concept.abstract, radius)
        loss_2 = loss_for_unrelated_examples_outside_sphere(concept.unrelated_examples, concept.abstract, radius)
        loss_3 = loss_for_uneven_distribution_of_related_examples_inside_sphere(concept.related_examples, concept.abstract, radius)

        loss = loss_1 + loss_2 + loss_3
        return loss

    concept_losses = [concept_loss(concept) for concept in concepts]
    stacked_losses = torch.stack(concept_losses)
    loss = stacked_losses.mean()
    return loss
