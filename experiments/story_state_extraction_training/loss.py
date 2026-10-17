from __future__ import annotations

from dataclasses import dataclass

import torch

SURFACE_STEEPNESS = 50.0
SPREAD_WEIGHT = 1.0
UNIFORM_POINT_COUNT = 256
COSINE_GRID_SIZE = 4096


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


def probability_inside(
    embeddings: torch.Tensor, centre: torch.Tensor, radius: torch.Tensor
) -> torch.Tensor:
    offsets = embeddings - centre
    squared_distances = offsets.pow(2).sum(dim=-1)
    margins = radius.pow(2) - squared_distances
    steep_margins = SURFACE_STEEPNESS * margins
    probabilities = torch.sigmoid(steep_margins)
    return probabilities


def classification_term(
    concept: ConceptEmbeddings, centre: torch.Tensor, radius: torch.Tensor
) -> torch.Tensor:
    unrelated_inside = probability_inside(concept.unrelated_examples, centre, radius)
    fraction_of_unrelated_inside = unrelated_inside.mean()
    return fraction_of_unrelated_inside


def uniform_points_in_area(centre: torch.Tensor, radius: torch.Tensor) -> torch.Tensor:
    dimensions = centre.shape[-1]
    centre_length = centre.norm()
    axis = centre / centre_length
    lowest_cosine = (1 + centre_length.pow(2) - radius.pow(2)) / (2 * centre_length)
    clamped_lowest_cosine = lowest_cosine.clamp(-1.0, 1.0)
    lowest_cosine_value = clamped_lowest_cosine.item()
    grid_edges = torch.linspace(lowest_cosine_value, 1.0, COSINE_GRID_SIZE + 1)
    cosines = (grid_edges[:-1] + grid_edges[1:]) / 2
    sines_squared = 1 - cosines.pow(2)
    non_negative_sines_squared = sines_squared.clamp(min=0)
    densities = non_negative_sines_squared.pow((dimensions - 3) / 2)
    cumulative = torch.cumsum(densities, dim=0)
    cumulative_fractions = cumulative / cumulative[-1]
    uniform_fractions = torch.rand(UNIFORM_POINT_COUNT)
    grid_positions = torch.searchsorted(cumulative_fractions, uniform_fractions)
    last_grid_position = COSINE_GRID_SIZE - 1
    valid_grid_positions = grid_positions.clamp(max=last_grid_position)
    drawn_cosines = cosines[valid_grid_positions]
    random_directions = torch.randn(UNIFORM_POINT_COUNT, dimensions)
    along_axis = random_directions @ axis
    tangents = random_directions - along_axis[:, None] * axis
    tangent_lengths = tangents.norm(dim=-1, keepdim=True)
    unit_tangents = tangents / tangent_lengths
    drawn_sines_squared = 1 - drawn_cosines.pow(2)
    drawn_sines = drawn_sines_squared.sqrt()
    points = drawn_cosines[:, None] * axis + drawn_sines[:, None] * unit_tangents
    return points


def mean_distance_between_distinct(points: torch.Tensor) -> torch.Tensor:
    distances = torch.cdist(points, points)
    count = points.shape[0]
    total = distances.sum()
    mean = total / (count * (count - 1))
    return mean


def spread_term(related_examples: torch.Tensor, uniform_points: torch.Tensor) -> torch.Tensor:
    cross_distances = torch.cdist(related_examples, uniform_points)
    mean_cross_distance = cross_distances.mean()
    examples_spread = mean_distance_between_distinct(related_examples)
    uniform_spread = mean_distance_between_distinct(uniform_points)
    energy_distance = 2 * mean_cross_distance - examples_spread - uniform_spread
    return energy_distance


def concept_loss(concept: ConceptEmbeddings) -> torch.Tensor:
    radius = radius_of_concept_sphere(concept.abstract, concept.related_examples)
    classification = classification_term(concept, concept.abstract, radius)
    related_example_count = concept.related_examples.shape[0]
    if related_example_count < 2:
        return classification
    uniform_points = uniform_points_in_area(concept.abstract, radius)
    spread = spread_term(concept.related_examples, uniform_points)
    loss = classification + SPREAD_WEIGHT * spread
    return loss


def salient_point_classification_loss(concepts: list[ConceptEmbeddings]) -> torch.Tensor:
    concept_losses = [concept_loss(concept) for concept in concepts]
    stacked_losses = torch.stack(concept_losses)
    loss = stacked_losses.mean()
    return loss
