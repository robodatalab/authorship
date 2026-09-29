from __future__ import annotations

import math
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import cortexgrid
import httpx
from cortexgrid import serve
from cortexgrid_infer import DeployedModel, Message, Text2Text
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from server.models import cluster
from server.models.long_context_qwen import (
    LONG_CONTEXT_QWEN,
    LONG_CONTEXT_QWEN_DEPLOYMENT,
)

_app = FastAPI()

CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY = "Authorship"
CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX = "causaleventtrajectoryclassifier"
CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_NAME = (
    f"{CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY}-{CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX}"
)

CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_INSTRUCTION = (
    "You read a whole novel, then a question about two of its events. Answer "
    "with the letter of the option you choose."
)

_QUESTION_ABOUT_CAUSE_AND_EFFECT = (
    "Suppose the event '{cause}' {happening}.\n"
    "Given the above information, will the chances of the occurrence of the "
    "event '{effect}' increase or decrease?\n"
    "A. {option_a}\n"
    "B. {option_b}\n"
    "Answer:"
)
_TOOK_PLACE = "took place"
_DID_NOT_TAKE_PLACE = "did NOT take place"
_INCREASE_AS_OPTION_A = {"option_a": "Increase", "option_b": "Decrease"}
_INCREASE_AS_OPTION_B = {"option_a": "Decrease", "option_b": "Increase"}

_ANSWERS_THAT_PICK_OPTION_A = ["A", " A"]
_ANSWERS_THAT_PICK_OPTION_B = ["B", " B"]


def _asked_of_the_story(story: str, question: str) -> list[Message]:
    return [
        {"role": "system", "content": CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_INSTRUCTION},
        {"role": "user", "content": f"<story>\n{story}\n</story>\n\n{question}"},
    ]


def probability_of_any(loglikelihoods: list[float]) -> float:
    probabilities = [math.exp(loglikelihood) for loglikelihood in loglikelihoods]
    return sum(probabilities)


def probability_of_increase(
    increase_as_option_a: list[float], increase_as_option_b: list[float]
) -> float:
    increase = increase_as_option_a[0] + increase_as_option_b[1]
    decrease = increase_as_option_a[1] + increase_as_option_b[0]
    return increase / (increase + decrease)


def deploy_causal_event_trajectory_classifier() -> cortexgrid.Deployment:
    cortexgrid.register_model(
        CausalEventTrajectoryClassifier,
        family=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY,
        suffix=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX,
        requirements=CausalEventTrajectoryClassifier.requirements(),
    )
    return cortexgrid.deploy_model(
        family=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY,
        suffix=CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX,
        run_name=cortexgrid.IMPORTED,
        timeout=cluster.DEPLOY_TIMEOUT_S,
    )


@serve.ingress(_app)
class CausalEventTrajectoryClassifier:
    @classmethod
    def requirements(cls) -> cortexgrid.ModelRequirements:
        return cortexgrid.ModelRequirements(
            ram_gb=1.0, models=[LONG_CONTEXT_QWEN_DEPLOYMENT]
        )

    @classmethod
    def client(cls, url: str, name: str) -> ServedCausalEventTrajectoryClassifier:
        return ServedCausalEventTrajectoryClassifier(url=url, model_id=name)

    def __init__(self, deployment: cortexgrid.DeploymentKey) -> None:
        long_context_qwen = cortexgrid.required_models(deployment)[0]
        self._long_context_qwen = Text2Text.client(
            long_context_qwen.url, LONG_CONTEXT_QWEN.model_id
        )

    @_app.post("/causal_effects")
    async def causal_effects(self, body: dict[str, Any]) -> StreamingResponse:
        return StreamingResponse(
            self._causal_effects(body["story"], body["causes_and_effects"]),
            media_type="text/plain",
        )

    async def _option_probabilities(self, story: str, question: str) -> list[float]:
        asked = _asked_of_the_story(story, question)
        loglikelihoods_of_each_option = [
            await self._long_context_qwen.loglikelihoods(asked, answers)
            for answers in (_ANSWERS_THAT_PICK_OPTION_A, _ANSWERS_THAT_PICK_OPTION_B)
        ]
        return [
            probability_of_any(loglikelihoods) for loglikelihoods in loglikelihoods_of_each_option
        ]

    async def _probability_of_increase(
        self, story: str, cause: str, happening: str, effect: str
    ) -> float:
        questions = [
            _QUESTION_ABOUT_CAUSE_AND_EFFECT.format(
                cause=cause, happening=happening, effect=effect, **options
            )
            for options in (_INCREASE_AS_OPTION_A, _INCREASE_AS_OPTION_B)
        ]
        increase_as_option_a, increase_as_option_b = [
            await self._option_probabilities(story, question) for question in questions
        ]
        return probability_of_increase(increase_as_option_a, increase_as_option_b)

    async def _causal_effects(
        self, story: str, causes_and_effects: list[list[str]]
    ) -> AsyncIterator[str]:
        for cause, effect in causes_and_effects:
            if_it_took_place = await self._probability_of_increase(
                story, cause, _TOOK_PLACE, effect
            )
            if_it_did_not_take_place = await self._probability_of_increase(
                story, cause, _DID_NOT_TAKE_PLACE, effect
            )
            causal_effect = if_it_took_place - if_it_did_not_take_place
            yield f"{causal_effect}\n"


@dataclass
class ServedCausalEventTrajectoryClassifier(DeployedModel):
    url: str
    model_id: str

    @property
    def name(self) -> str:
        return self.model_id

    async def causal_effects(
        self, story: str, causes_and_effects: list[tuple[str, str]]
    ) -> AsyncIterator[float]:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{self.url}/causal_effects",
                json={"story": story, "causes_and_effects": causes_and_effects},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    yield float(line)
