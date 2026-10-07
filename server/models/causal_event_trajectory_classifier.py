from __future__ import annotations

import math
from collections.abc import AsyncIterator

import cortexgrid
from cortexgrid import serve
from cortexgrid_infer import Message, Text2Text

from server.models import cluster
from server.models.long_context_qwen import LONG_CONTEXT_QWEN_DEPLOYMENT

CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY = "Authorship"
CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX = "causaleventtrajectoryclassifier"
CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_NAME = (
    f"{CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY}-{CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX}"
)

CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_INSTRUCTION = (
    "You read a story, then a question about two of its events. Answer Yes or No."
)

_QUESTION_ABOUT_THE_SITUATION = (
    "Event 1: {previous}\n"
    "Event 2: {event}\n"
    "Does event 2 continue the situation event 1 is part of: the same characters, "
    "in the same place, busy with the same thing?\n"
    "Answer:"
)

_ANSWERS_THAT_SAY_YES = ["Yes", " Yes"]
_ANSWERS_THAT_SAY_NO = ["No", " No"]


def _asked_of_the_story(story: str, question: str) -> list[Message]:
    return [
        {"role": "system", "content": CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_INSTRUCTION},
        {"role": "user", "content": f"<story>\n{story}\n</story>\n\n{question}"},
    ]


def probability_of_any(loglikelihoods: list[float]) -> float:
    probabilities = [math.exp(loglikelihood) for loglikelihood in loglikelihoods]
    return sum(probabilities)


def probability_of_yes(yes_loglikelihoods: list[float], no_loglikelihoods: list[float]) -> float:
    yes = probability_of_any(yes_loglikelihoods)
    no = probability_of_any(no_loglikelihoods)
    return yes / (yes + no)


def deploy_causal_event_trajectory_classifier() -> cortexgrid.Deployment[
    CausalEventTrajectoryClassifier
]:
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


@serve.ingress
class CausalEventTrajectoryClassifier:
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
    async def same_situation_probabilities(
        self, story: str, pairs_of_events: list[tuple[str, str]]
    ) -> AsyncIterator[float]:
        for previous, event in pairs_of_events:
            question = _QUESTION_ABOUT_THE_SITUATION.format(previous=previous, event=event)
            asked = _asked_of_the_story(story, question)
            yes_loglikelihoods = await self._long_context_qwen.loglikelihoods(
                asked, _ANSWERS_THAT_SAY_YES
            )
            no_loglikelihoods = await self._long_context_qwen.loglikelihoods(
                asked, _ANSWERS_THAT_SAY_NO
            )
            probability = probability_of_yes(yes_loglikelihoods, no_loglikelihoods)
            yield probability
