from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import cortexgrid
import httpx
from cortexgrid import serve
from cortexgrid_infer import Message, ServedCompletingModel
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import TypeAdapter

from server import log
from server.models import cluster
from server.models.causal_event_trajectory_classifier import probability_of_yes
from server.models.long_context_qwen import LONG_CONTEXT_QWEN_DEPLOYMENT
from server.models.story_state import StoryFact, StoryState

_app = FastAPI()
_log = log.logger(__name__)

STORY_STATE_EXTRACTION_MODEL_FAMILY = "Authorship"
STORY_STATE_EXTRACTION_MODEL_SUFFIX = "storystateextractionmodel"
STORY_STATE_EXTRACTION_MODEL_NAME = (
    f"{STORY_STATE_EXTRACTION_MODEL_FAMILY}-{STORY_STATE_EXTRACTION_MODEL_SUFFIX}"
)

SCENE_CONTINUATION_INSTRUCTION = (
    "You read a story up to a line, then a question about that line. Answer Yes or No."
)

_QUESTION_ABOUT_THE_SCENE = (
    "The story stops at the line: {line}\n"
    "Does that line continue the scene of the lines before it, with the same "
    "characters in the same place at the same time, rather than begin a new scene?\n"
    "Answer:"
)

_ANSWERS_THAT_SAY_YES = ["Yes", " Yes"]
_ANSWERS_THAT_SAY_NO = ["No", " No"]

STORY_STATE_EXTRACTION_INSTRUCTION = """
You read a story up to the end of one of its scenes, which is marked with <scene> tags. Describe the state of the story's world in that scene as a still frame, complete enough to recreate the moment: who is there, where they are, what they are doing, and what holds for them and the things around them.

Say what a character is doing the way you would sum up the whole scene in a short phrase - trying on dresses, being interviewed for a job, cleaning the office - never the single movements, gestures and glances that make it up.
Leave out the narrator's impressions and comparisons.
Call every character, place and thing by the name the story has given it so far, however the scene refers to it.

List as false what held in earlier scenes and no longer holds in this one.

Answer with one statement per line, in format <true|false>: <subject> | <relation> | <object>, with all three parts filled in.
Write nothing else.

Example story:

Ann came home late and found the front door unlocked. Her brother Tom was in the kitchen, reading her diary.
<scene>
She snatched it from him, ran upstairs and locked herself in her room. She sat on her bed with the diary in her lap, listening to Tom knocking on the door.
</scene>

Example answer:

true: Ann | is in | her room
true: Ann | is doing | hiding her diary from Tom
true: Ann | holds | her diary
true: Ann's room | is | locked
true: Tom | is | Ann's brother
true: Tom | is at | the door of Ann's room
true: Tom | is doing | trying to get Ann to open the door
false: Ann | is in | the kitchen
false: Tom | holds | Ann's diary
"""

LONGEST_SCENE_DESCRIPTION_IN_TOKENS = 1024

_TRUE = "true"
_FALSE = "false"


def _asked_whether_the_scene_goes_on(story_so_far: str, line: str) -> list[Message]:
    question = _QUESTION_ABOUT_THE_SCENE.format(line=line)
    return [
        {"role": "system", "content": SCENE_CONTINUATION_INSTRUCTION},
        {"role": "user", "content": f"<story>\n{story_so_far}\n</story>\n\n{question}"},
    ]


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


@serve.ingress(_app)
class StoryStateExtractionModel:

    @classmethod
    def deploy(cls) -> cortexgrid.Deployment[
        ServedStoryStateExtractionModel
    ]:
        cortexgrid.register_model(
            cls,
            family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
            suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
            requirements=cls.requirements(),
        )
        return cortexgrid.deploy_model(
            family=STORY_STATE_EXTRACTION_MODEL_FAMILY,
            suffix=STORY_STATE_EXTRACTION_MODEL_SUFFIX,
            run_name=cortexgrid.IMPORTED,
            timeout=cluster.DEPLOY_TIMEOUT_S,
        )
    
    @classmethod
    def requirements(cls) -> cortexgrid.ModelRequirements:
        return cortexgrid.ModelRequirements(
            ram_gb=1.0, models=[LONG_CONTEXT_QWEN_DEPLOYMENT]
        )

    @classmethod
    def client(
        cls, deployment: cortexgrid.Deployment[ServedStoryStateExtractionModel]
    ) -> ServedStoryStateExtractionModel:
        return ServedStoryStateExtractionModel(key=deployment.key, url=deployment.url)

    def __init__(self, deployment: cortexgrid.DeploymentKey) -> None:
        required_models = cortexgrid.required_models(deployment)
        long_context_qwen = required_models[0]
        self._long_context_qwen: ServedCompletingModel = long_context_qwen.client()

    @_app.post("/scene_continuation_probabilities")
    async def scene_continuation_probabilities(self, body: dict[str, Any]) -> StreamingResponse:
        probabilities = self._scene_continuation_probabilities(body["lines"])
        return StreamingResponse(probabilities, media_type="text/plain")

    async def _scene_continuation_probabilities(self, lines: list[str]) -> AsyncIterator[str]:
        for lines_read in range(2, len(lines) + 1):
            story_so_far = "\n\n".join(lines[:lines_read])
            asked = _asked_whether_the_scene_goes_on(story_so_far, lines[lines_read - 1])
            yes_loglikelihoods = await self._long_context_qwen.loglikelihoods(
                asked, _ANSWERS_THAT_SAY_YES
            )
            no_loglikelihoods = await self._long_context_qwen.loglikelihoods(
                asked, _ANSWERS_THAT_SAY_NO
            )
            probability = probability_of_yes(yes_loglikelihoods, no_loglikelihoods)
            yield f"{probability}\n"

    @_app.post("/story_state")
    async def story_state(self, body: dict[str, Any]) -> StoryState:
        story_up_to_the_scene = (
            f"{body['story_before_the_scene']}\n<scene>\n{body['scene']}\n</scene>"
        )
        chunks = self._long_context_qwen.complete(
            [
                {"role": "system", "content": STORY_STATE_EXTRACTION_INSTRUCTION},
                {"role": "user", "content": story_up_to_the_scene},
            ],
            max_new_tokens=LONGEST_SCENE_DESCRIPTION_IN_TOKENS,
            temperature=0.0,
        )
        answer = "".join([chunk.content async for chunk in chunks])
        story_state = story_state_of(answer)
        return story_state


class ServedStoryStateExtractionModel(cortexgrid.DeploymentClient):
    async def scene_continuation_probabilities(self, lines: list[str]) -> AsyncIterator[float]:
        body = {"lines": lines}
        scene_continuation_probabilities_url = f"{self.url}/scene_continuation_probabilities"
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST", scene_continuation_probabilities_url, json=body
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    probability = float(line)
                    yield probability

    async def story_state(self, story_before_the_scene: str, scene: str) -> StoryState:
        body = {"story_before_the_scene": story_before_the_scene, "scene": scene}
        story_state_url = f"{self.url}/story_state"
        async with httpx.AsyncClient(timeout=None) as client:
            response = await client.post(story_state_url, json=body)
        response.raise_for_status()
        answered = response.json()
        story_state_on_the_wire = TypeAdapter(StoryState)
        story_state = story_state_on_the_wire.validate_python(answered)
        return story_state
