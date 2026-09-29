from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cortexgrid
import httpx
from cortexgrid import serve
from cortexgrid_infer import DeployedModel, Text2Text
from fastapi import FastAPI
from pydantic import TypeAdapter

from server import log
from server.models import cluster
from server.models.long_context_qwen import (
    LONG_CONTEXT_QWEN,
    LONG_CONTEXT_QWEN_DEPLOYMENT,
)
from server.models.story_state import StoryFact, StoryState

_app = FastAPI()
_log = log.logger(__name__)

STORY_STATE_EXTRACTION_MODEL_FAMILY = "Authorship"
STORY_STATE_EXTRACTION_MODEL_SUFFIX = "storystateextractionmodel"
STORY_STATE_EXTRACTION_MODEL_NAME = (
    f"{STORY_STATE_EXTRACTION_MODEL_FAMILY}-{STORY_STATE_EXTRACTION_MODEL_SUFFIX}"
)

STORY_STATE_EXTRACTION_INSTRUCTION = """
You read a story up to the point where it stops. Describe the state of the story's world at that point: for every character, where they are and what they are doing.

Say what a character is doing the way you would sum up a scene in a short phrase - trying on dresses, cleaning the office, waiting for a train - never the single movements, gestures and glances that make it up.
Leave out how people and things look, and the narrator's impressions and comparisons.

List as false where characters were and what they were doing earlier in the story, once it is no longer so.

Answer with one line per character's place or activity, in format <true|false>: <character> | <is in|is doing> | <place or activity>.
Write nothing else.

Example story:

Ann came home late and found the front door unlocked. Her brother Tom was in the kitchen, reading her diary. She snatched it from him, ran upstairs and locked herself in her room.

Example answer:

true: Ann | is in | her room
true: Ann | is doing | hiding from Tom
true: Tom | is in | the kitchen
false: Ann | is in | the kitchen
false: Tom | is doing | reading Ann's diary
"""

_TRUE = "true"
_FALSE = "false"


def story_state_of(answer: str) -> StoryState:
    made_true: set[StoryFact] = set()
    made_false: set[StoryFact] = set()
    statements = answer.splitlines()
    for statement in statements:
        truth, _, fact = statement.partition(": ")
        parts = fact.split(" | ")
        if truth not in (_TRUE, _FALSE) or len(parts) != 3 or not all(parts):
            _log.warning("Skipped a statement that is not a true or false fact: %r", statement)
            continue
        story_fact = StoryFact(*parts)
        if truth == _TRUE:
            made_true.add(story_fact)
        else:
            made_false.add(story_fact)
    true_facts = frozenset(made_true)
    false_facts = frozenset(made_false)
    story_state = StoryState(made_true=true_facts, made_false=false_facts)
    return story_state


def deploy_story_state_extraction_model() -> cortexgrid.Deployment:
    cortexgrid.register_model(
        StoryStateExtractionModel,
        family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
        suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
        requirements=StoryStateExtractionModel.requirements(),
    )
    return cortexgrid.deploy_model(
        family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
        suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
        run_name=cortexgrid.IMPORTED,
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

    @_app.post("/story_state")
    async def story_state(self, body: dict[str, Any]) -> StoryState:
        chunks = self._long_context_qwen.complete(
            [
                {"role": "system", "content": STORY_STATE_EXTRACTION_INSTRUCTION},
                {"role": "user", "content": body["story"]},
            ],
            temperature=0.0,
        )
        answer = "".join([chunk.content async for chunk in chunks])
        story_state = story_state_of(answer)
        return story_state


@dataclass
class ServedStoryStateExtractionModel(DeployedModel):
    url: str
    model_id: str

    @property
    def name(self) -> str:
        return self.model_id

    async def story_state(self, story: str) -> StoryState:
        body = {"story": story}
        story_state_url = f"{self.url}/story_state"
        async with httpx.AsyncClient(timeout=None) as client:
            response = await client.post(story_state_url, json=body)
        response.raise_for_status()
        answered = response.json()
        story_state_on_the_wire = TypeAdapter(StoryState)
        story_state = story_state_on_the_wire.validate_python(answered)
        return story_state
