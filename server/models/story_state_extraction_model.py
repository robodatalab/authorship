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

StoryStateSpaceBasis = Tensor
StoryStateVector = Tensor

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
    async def encode_basis(self, story: str) -> StoryStateSpaceBasis:
        basis = torch.eye(2048)
        return basis

    @serve.endpoint
    async def encode_from_state(
        self, basis: StoryStateSpaceBasis, state: StoryState
    ) -> StoryStateVector:
        description = str(state)
        architecture = await self._long_context_qwen.architecture()
        layer_idxs = list(range(1, architecture.layer_count + 1))
        hidden_states = await self._long_context_qwen.hidden_states_at_layers(
            description, layer_idxs
        )
        hidden_states_without_the_attention_sink = hidden_states[:, 1:]
        meaning_at_each_layer = hidden_states_without_the_attention_sink.mean(dim=1)
        layer_weights = gaussian_weights_of_layers(layer_idxs)
        meaning_of_the_state = layer_weights @ meaning_at_each_layer
        story_state = basis @ meaning_of_the_state
        return story_state

    @serve.endpoint
    async def encode_from_text(
        self, basis: StoryStateSpaceBasis, text: str
    ) -> StoryStateVector:
        story_state = torch.zeros((3,))
        return story_state
