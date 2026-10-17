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


def scale_loss_for_related_examples_inside_sphere(loss: torch.Tensor, example_count: int) -> torch.Tensor:
    loss_of_the_farthest_example_on_the_surface = 0.5
    total_loss = loss * example_count
    total_loss_of_the_examples_besides_the_farthest = total_loss - loss_of_the_farthest_example_on_the_surface
    examples_besides_the_farthest_or_one = max(example_count - 1, 1)
    scaled_loss = total_loss_of_the_examples_besides_the_farthest / examples_besides_the_farthest_or_one
    return scaled_loss


def scale_loss_for_uneven_distribution_of_related_examples_inside_sphere(
    loss: torch.Tensor, example_count: int, dimensions: int
) -> torch.Tensor:
    expected_rayleigh_imbalance_of_uniform_examples = 1 / example_count
    expected_bingham_anisotropy_of_uniform_examples = (1 - 1 / dimensions) / example_count
    expected_radial_unevenness_of_uniform_examples = (2 * example_count + 1) / (12 * example_count**2)
    expected_loss_of_uniform_examples = (
        expected_rayleigh_imbalance_of_uniform_examples
        + expected_bingham_anisotropy_of_uniform_examples
        + expected_radial_unevenness_of_uniform_examples
    )
    excess_loss = loss - expected_loss_of_uniform_examples

    examples_besides_the_farthest_or_one = max(example_count - 1, 1)
    share_of_examples_besides_the_farthest = examples_besides_the_farthest_or_one / example_count
    largest_excess_rayleigh_imbalance = share_of_examples_besides_the_farthest
    largest_excess_bingham_anisotropy = (1 - 1 / dimensions) * share_of_examples_besides_the_farthest
    largest_excess_radial_unevenness = (2 * example_count + 1) * share_of_examples_besides_the_farthest / (6 * example_count)
    largest_excess_loss = (
        largest_excess_rayleigh_imbalance
        + largest_excess_bingham_anisotropy
        + largest_excess_radial_unevenness
    )

    relative_excess_loss = excess_loss / largest_excess_loss
    scaled_loss = relative_excess_loss.clamp(min=0.0)
    return scaled_loss


def salient_point_classification_loss(concepts: list[ConceptEmbeddings]) -> torch.Tensor:

    def concept_loss(concept: ConceptEmbeddings) -> torch.Tensor:
        radius = radius_of_concept_sphere(concept.abstract, concept.related_examples)
        loss_1 = loss_for_related_examples_inside_sphere(concept.related_examples, concept.abstract, radius)
        loss_2 = loss_for_unrelated_examples_outside_sphere(concept.unrelated_examples, concept.abstract, radius)
        loss_3 = loss_for_uneven_distribution_of_related_examples_inside_sphere(concept.related_examples, concept.abstract, radius)

        example_count = concept.related_examples.shape[0]
        dimensions = concept.related_examples.shape[-1]
        scaled_loss_1 = scale_loss_for_related_examples_inside_sphere(loss_1, example_count)
        scaled_loss_3 = scale_loss_for_uneven_distribution_of_related_examples_inside_sphere(loss_3, example_count, dimensions)

        loss = scaled_loss_1 + loss_2 + scaled_loss_3
        return loss

    concept_losses = [concept_loss(concept) for concept in concepts]
    stacked_losses = torch.stack(concept_losses)
    loss = stacked_losses.mean()
    return loss
