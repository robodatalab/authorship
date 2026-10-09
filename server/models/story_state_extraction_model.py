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
    origin: Tensor
    axes: Tensor

    def coordinates_of(self, embedding: torch.Tensor) -> torch.Tensor:
        centred_embedding = embedding - self.origin
        coordinates = self.axes @ centred_embedding
        normalized_coordinates = torch.nn.functional.normalize(coordinates, dim=0)
        return normalized_coordinates


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


async def concept_embedding_in_the_story(
    concept: str, story: str, model: Text2Text
) -> torch.Tensor:
    layer_idxs = await every_layer_idx(model)
    concept_alone = await model.hidden_states_at_layers(concept, [0])
    concept_token_count = concept_alone.shape[1]
    story_then_concept = f"{story}\n{concept}"
    hidden_states = await model.hidden_states_at_layers(story_then_concept, layer_idxs)
    hidden_states_of_the_concept = hidden_states[:, -concept_token_count:]
    embedding_of_the_concept = embedding_of_tokens(hidden_states_of_the_concept, layer_idxs)
    return embedding_of_the_concept

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
    async def encode_basis(self, story: str, salient_concepts: list[str]) -> StoryStateSpaceBasis:
        paragraphs = [line for line in story.splitlines() if line]
        embeddings_of_the_paragraphs = [
            await state_embedding(paragraph, self._long_context_qwen) for paragraph in paragraphs
        ]
        paragraph_embeddings = torch.stack(embeddings_of_the_paragraphs)
        origin = paragraph_embeddings.mean(dim=0)
        embeddings_of_the_concepts = [
            await concept_embedding_in_the_story(concept, story, self._long_context_qwen)
            for concept in salient_concepts
        ]
        concept_embeddings = torch.stack(embeddings_of_the_concepts)
        centred_concept_embeddings = concept_embeddings - origin
        axes = torch.nn.functional.normalize(centred_concept_embeddings, dim=1)
        basis = StoryStateSpaceBasis(origin=origin, axes=axes)
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
