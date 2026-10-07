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

StoryStateSpaceBasis = Tensor
StoryStateVector = Tensor

@dataclass(frozen=True)
class StoryState:
    characters: list[str]
    location: str
    event: str
    action: str


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
        basis = torch.zeros((3, 3))
        return basis

    @serve.endpoint
    async def encode_from_state(
        self, basis: StoryStateSpaceBasis, state: StoryState
    ) -> StoryStateVector:
        story_state = torch.zeros((3,))
        return story_state

    @serve.endpoint
    async def encode_from_text(
        self, basis: StoryStateSpaceBasis, text: str
    ) -> StoryStateVector:
        story_state = torch.zeros((3,))
        return story_state
