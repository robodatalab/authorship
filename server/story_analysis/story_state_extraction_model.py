from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import astuple, dataclass
from enum import Enum
from typing import Any

import cortexgrid
import httpx
import torch
from cortexgrid import serve
from cortexgrid_infer import DeployedModel, Text2Text
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from server.models import cluster
from server.story_analysis.long_context_qwen import (
    LONG_CONTEXT_QWEN,
    LONG_CONTEXT_QWEN_DEPLOYMENT,
)
from server.story_analysis.story_state import StoryFact, StoryState

_app = FastAPI()

STORY_STATE_EXTRACTION_MODEL_FAMILY = "Authorship"
STORY_STATE_EXTRACTION_MODEL_SUFFIX = "storystateextractionmodel"
STORY_STATE_EXTRACTION_MODEL_NAME = (
    f"{STORY_STATE_EXTRACTION_MODEL_FAMILY}-{STORY_STATE_EXTRACTION_MODEL_SUFFIX}"
)
HEAD_WEIGHTS_FILE = "head.pt"

CANDIDATE_STORY_FACT = "{subject} | {relation} | {object}"


class StoryFactLabel(Enum):
    MADE_TRUE = "made true"
    MADE_FALSE = "made false"
    REQUIRED = "required"
    NOT_AFFECTED = "not affected"


@dataclass(frozen=True)
class ExtractedStoryState:
    change: StoryState
    requires: frozenset[StoryFact]


def candidate_text(candidate: StoryFact) -> str:
    return CANDIDATE_STORY_FACT.format(
        subject=candidate.subject, relation=candidate.relation, object=candidate.object
    )


def label_of(scores: list[float]) -> StoryFactLabel:
    highest_score = max(scores)
    chosen = scores.index(highest_score)
    labels = list(StoryFactLabel)
    return labels[chosen]


def extracted_story_state(
    candidates: list[StoryFact], labels: list[StoryFactLabel]
) -> ExtractedStoryState:
    labelled = list(zip(candidates, labels))
    made_true = frozenset(fact for fact, label in labelled if label is StoryFactLabel.MADE_TRUE)
    made_false = frozenset(fact for fact, label in labelled if label is StoryFactLabel.MADE_FALSE)
    required = frozenset(fact for fact, label in labelled if label is StoryFactLabel.REQUIRED)
    change = StoryState(made_true=made_true, made_false=made_false)
    return ExtractedStoryState(change=change, requires=required)


def deploy_story_state_extraction_model(run_name: str) -> cortexgrid.Deployment:
    return cortexgrid.deploy_model(
        family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
        suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
        run_name=run_name,
        timeout=cluster.DEPLOY_TIMEOUT_S,
    )


@serve.ingress(_app)
class StoryStateExtractionModel:
    @classmethod
    def requirements(cls) -> cortexgrid.ModelRequirements:
        return cortexgrid.ModelRequirements(
            ram_gb=1.0, models=[LONG_CONTEXT_QWEN_DEPLOYMENT]
        )

    @classmethod
    def client(cls, url: str, name: str) -> ServedStoryStateExtractionModel:
        return ServedStoryStateExtractionModel(url=url, model_id=name)

    def __init__(self, deployment: cortexgrid.DeploymentKey) -> None:
        required_models = cortexgrid.required_models(deployment)
        long_context_qwen = required_models[0]
        self._long_context_qwen = Text2Text.client(
            long_context_qwen.url, LONG_CONTEXT_QWEN.model_id
        )
        trained_path = cortexgrid.load_model(
            deployment.family, deployment.suffix, deployment.run_name
        )
        head_path = trained_path / HEAD_WEIGHTS_FILE
        trained_head = torch.load(head_path, map_location="cpu")
        hidden_size = trained_head["weight"].shape[1]
        labels_count = len(StoryFactLabel)
        self._head = torch.nn.Linear(hidden_size, labels_count)
        self._head.load_state_dict(trained_head)

    @_app.post("/labels")
    async def labels(self, body: dict[str, Any]) -> StreamingResponse:
        candidates_of_each_line = [
            [StoryFact(*fact) for fact in candidates]
            for candidates in body["candidates_of_each_line"]
        ]
        labels_of_each_line = self._labels_of_each_line(body["lines"], candidates_of_each_line)
        return StreamingResponse(labels_of_each_line, media_type="text/plain")

    async def _labels_of_each_line(
        self, lines: list[str], candidates_of_each_line: list[list[StoryFact]]
    ) -> AsyncIterator[str]:
        story_parts = [f"{line}\n" for line in lines]
        candidate_texts_of_each_line = [
            [candidate_text(candidate) for candidate in candidates]
            for candidates in candidates_of_each_line
        ]
        last_hidden_states_of_each_line = self._long_context_qwen.last_hidden_states(
            story_parts, candidate_texts_of_each_line
        )
        async for last_hidden_states in last_hidden_states_of_each_line:
            candidates_count = len(last_hidden_states)
            hidden_vectors = torch.tensor(last_hidden_states, dtype=torch.float32)
            hidden_vectors = hidden_vectors.reshape(candidates_count, self._head.in_features)
            with torch.inference_mode():
                scores = self._head(hidden_vectors)
            scores_of_each_candidate = scores.tolist()
            labels = [label_of(candidate_scores) for candidate_scores in scores_of_each_candidate]
            label_values = [label.value for label in labels]
            answered_line = json.dumps(label_values)
            yield f"{answered_line}\n"


@dataclass
class ServedStoryStateExtractionModel(DeployedModel):
    url: str
    model_id: str

    @property
    def name(self) -> str:
        return self.model_id

    async def story_states(
        self, lines: list[str], candidates_of_each_line: list[list[StoryFact]]
    ) -> AsyncIterator[ExtractedStoryState]:
        sent_candidates_of_each_line = [
            [astuple(fact) for fact in candidates] for candidates in candidates_of_each_line
        ]
        body = {"lines": lines, "candidates_of_each_line": sent_candidates_of_each_line}
        labels_url = f"{self.url}/labels"
        candidates_in_order = iter(candidates_of_each_line)
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", labels_url, json=body) as response:
                response.raise_for_status()
                async for answered_line in response.aiter_lines():
                    candidates = next(candidates_in_order)
                    label_values = json.loads(answered_line)
                    labels = [StoryFactLabel(value) for value in label_values]
                    extracted = extracted_story_state(candidates, labels)
                    yield extracted
