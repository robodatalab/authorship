from __future__ import annotations

from dataclasses import dataclass

import cortexgrid
from cortexgrid import serve
from cortexgrid_infer import Tensor, Text2Text
import torch

from server import log
from server.models import cluster
from server.models.long_context_qwen import LONG_CONTEXT_QWEN_DEPLOYMENT

_log = log.logger(__name__)

LONGEST_SCENE_DESCRIPTION_IN_TOKENS = 1024

STANDARD_DEVIATIONS_BETWEEN_THE_MIDDLE_AND_THE_OUTERMOST_LAYERS = 3.0

StoryStateVector = Tensor


@dataclass(frozen=True)
class StoryStateSpaceBasis:
    origins: Tensor
    axes: Tensor

    def coordinates_of(self, embedding: torch.Tensor) -> torch.Tensor:
        centred_embeddings = embedding - self.origins
        coordinates = torch.linalg.vecdot(self.axes, centred_embeddings, dim=1)
        normalized_coordinates = torch.nn.functional.normalize(coordinates, dim=0)
        return normalized_coordinates


@dataclass(frozen=True)
class SalientConcept:
    name: str
    paragraph_idxs: list[int]


@dataclass(frozen=True)
class StoryState:

    characters: list[str]
    location: str
    event: str
    action: str

    def __str__(self) -> str:
        characters = ", ".join(self.characters)
        description = (
            f"characters: {characters}\n"
            f"location: {self.location}\n"
            f"event: {self.event}\n"
            f"action: {self.action}"
        )
        return description


def gaussian_weights_of_layers(layer_idxs: list[int]) -> torch.Tensor:
    layers = torch.tensor(layer_idxs, dtype=torch.float32)
    middle = (layers[0] + layers[-1]) / 2
    spread = (layers[-1] - middle) / STANDARD_DEVIATIONS_BETWEEN_THE_MIDDLE_AND_THE_OUTERMOST_LAYERS
    distribution = torch.distributions.Normal(middle, spread)
    log_densities = distribution.log_prob(layers)
    densities = log_densities.exp()
    weights = densities / densities.sum()
    return weights


def embedding_of_tokens(hidden_states: torch.Tensor, layer_idxs: list[int]) -> torch.Tensor:
    meaning_at_each_layer = hidden_states.mean(dim=1)
    layer_weights = gaussian_weights_of_layers(layer_idxs)
    embedding = layer_weights @ meaning_at_each_layer
    normalized_embedding = torch.nn.functional.normalize(embedding, dim=0)
    return normalized_embedding


async def every_layer_idx(model: Text2Text) -> list[int]:
    architecture = await model.architecture()
    layer_idxs = list(range(1, architecture.layer_count + 1))
    return layer_idxs


async def state_embedding(state_description: str, model: Text2Text) -> StoryStateVector:
    layer_idxs = await every_layer_idx(model)
    hidden_states = await model.hidden_states_at_layers(
        state_description, layer_idxs
    )
    hidden_states_without_the_attention_sink = hidden_states[:, 1:]
    embedding_of_the_state = embedding_of_tokens(
        hidden_states_without_the_attention_sink, layer_idxs
    )
    return embedding_of_the_state


def midpoint_and_direction(
    concept: SalientConcept, paragraph_embeddings: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    appears = torch.zeros(len(paragraph_embeddings), dtype=torch.bool)
    appears[concept.paragraph_idxs] = True
    if appears.all() or not appears.any():
        raise ValueError(f"{concept.name!r} needs paragraphs both with and without it")
    with_the_concept = paragraph_embeddings[appears].mean(dim=0)
    without_the_concept = paragraph_embeddings[~appears].mean(dim=0)
    midpoint = (with_the_concept + without_the_concept) / 2
    difference = with_the_concept - without_the_concept
    direction = torch.nn.functional.normalize(difference, dim=0)
    return midpoint, direction

@serve.ingress
class StoryStateExtractionModel:

    @classmethod
    def deploy(cls) -> cortexgrid.Deployment[
        StoryStateExtractionModel
    ]:
        family = "Authorship"
        suffix = "storystateextractionmodel"
        cortexgrid.register_model(
            cls,
            family=family,
            suffix=suffix,
            requirements=cls.requirements(),
        )
        return cortexgrid.deploy_model(
            family=family,
            suffix=suffix,
            run_name=cortexgrid.IMPORTED,
            timeout=cluster.DEPLOY_TIMEOUT_S,
        )
    
    @classmethod
    def requirements(cls) -> cortexgrid.ModelRequirements:
        return cortexgrid.ModelRequirements(
            ram_gb=1.0, models=[LONG_CONTEXT_QWEN_DEPLOYMENT]
        )

    def __init__(self, deployment: cortexgrid.DeploymentKey) -> None:
        required_models = cortexgrid.required_models(deployment)
        long_context_qwen = required_models[0]
        self._long_context_qwen: Text2Text = long_context_qwen.client()

    @serve.endpoint
    async def encode_basis(
        self, story: str, salient_concepts: list[SalientConcept]
    ) -> StoryStateSpaceBasis:
        paragraphs = [line for line in story.splitlines() if line]
        embeddings_of_the_paragraphs = [
            await state_embedding(paragraph, self._long_context_qwen) for paragraph in paragraphs
        ]
        paragraph_embeddings = torch.stack(embeddings_of_the_paragraphs)
        midpoints_and_directions = [
            midpoint_and_direction(concept, paragraph_embeddings) for concept in salient_concepts
        ]
        midpoints = [midpoint for midpoint, _ in midpoints_and_directions]
        directions = [direction for _, direction in midpoints_and_directions]
        origins = torch.stack(midpoints)
        axes = torch.stack(directions)
        basis = StoryStateSpaceBasis(origins=origins, axes=axes)
        return basis

    @serve.endpoint
    async def encode_from_state(
        self, basis: StoryStateSpaceBasis, state: StoryState
    ) -> StoryStateVector:
        description = str(state)

        embedding = await state_embedding(description, self._long_context_qwen)
        
        story_state = basis.coordinates_of(embedding)
        return story_state

    @serve.endpoint
    async def encode_from_text(
        self, basis: StoryStateSpaceBasis, text: str
    ) -> StoryStateVector:
        embedding = await state_embedding(text, self._long_context_qwen)

        story_state = basis.coordinates_of(embedding)
        return story_state
