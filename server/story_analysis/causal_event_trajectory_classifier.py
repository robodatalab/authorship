from __future__ import annotations

import threading
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from typing import Any

import cortexgrid
import httpx
import torch
from cortexgrid import serve
from cortexgrid_infer import (
    DeployedModel,
    HuggingFaceImporter,
    Text2Text,
    detect_device,
)
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from transformers import (
    AutoConfig,
    AutoModelForCausalLM,
    AutoTokenizer,
    DynamicCache,
    PreTrainedModel,
)

from server.models import cluster

_app = FastAPI()

CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY = "Authorship"
CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX = "causaleventtrajectoryclassifier"
CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_NAME = (
    f"{CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_FAMILY}-{CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_SUFFIX}"
)
CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_BASE_MODEL = "Qwen/Qwen3-8B"
BASE_MODEL_PARAM = "base_model"

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

_WHERE_THE_STORY_ENDS = "\ue010"
_ANSWERS_THAT_PICK_OPTION_A = ("A", " A")
_ANSWERS_THAT_PICK_OPTION_B = ("B", " B")
_NATIVE_CONTEXT_OF_QWEN3 = 32768
_YARN_STRETCH = 4.0


def _asked_of_the_story(tokenizer: Any, story: str, question: str) -> tuple[str, str]:
    rendered = tokenizer.apply_chat_template(
        [
            {"role": "system", "content": CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_INSTRUCTION},
            {
                "role": "user",
                "content": f"<story>\n{story}\n</story>\n\n{_WHERE_THE_STORY_ENDS}"
                f"{question}",
            },
        ],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )
    the_story, the_question = rendered.split(_WHERE_THE_STORY_ENDS)
    return the_story, the_question


def _first_tokens_of(tokenizer: Any, answers: tuple[str, ...]) -> list[int]:
    return sorted(
        {tokenizer.encode(answer, add_special_tokens=False)[0] for answer in answers}
    )


def read_the_story(model: PreTrainedModel, story_ids: torch.Tensor) -> DynamicCache:
    story_read = DynamicCache(config=model.config)
    with torch.inference_mode():
        model(
            input_ids=story_ids, past_key_values=story_read, use_cache=True, logits_to_keep=1
        )
    return story_read


def answer_logits_after_the_story(
    model: PreTrainedModel, story_read: DynamicCache, question_ids: torch.Tensor
) -> torch.Tensor:
    with torch.inference_mode():
        answered = model(
            input_ids=question_ids,
            past_key_values=story_read,
            use_cache=True,
            logits_to_keep=1,
        )
    story_read.crop(-question_ids.shape[-1])
    return answered.logits[0, -1]


def probability_of_increase(
    increase_as_option_a: torch.Tensor,
    increase_as_option_b: torch.Tensor,
    option_a_ids: list[int],
    option_b_ids: list[int],
) -> float:
    answers_to_a = torch.softmax(increase_as_option_a.float(), dim=-1)
    answers_to_b = torch.softmax(increase_as_option_b.float(), dim=-1)
    increase = answers_to_a[option_a_ids].sum() + answers_to_b[option_b_ids].sum()
    decrease = answers_to_a[option_b_ids].sum() + answers_to_b[option_a_ids].sum()
    return float(increase / (increase + decrease))


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
        config={BASE_MODEL_PARAM: CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_BASE_MODEL},
    )


@serve.ingress(_app)
class CausalEventTrajectoryClassifier:
    @classmethod
    def requirements(cls) -> cortexgrid.ModelRequirements:
        return cortexgrid.ModelRequirements(num_gpus=1, ram_gb=20.0, vram_gb=32.0)

    @classmethod
    def client(cls, url: str, name: str) -> ServedCausalEventTrajectoryClassifier:
        return ServedCausalEventTrajectoryClassifier(url=url, model_id=name)

    def __init__(self, deployment: cortexgrid.DeploymentKey) -> None:
        base_model = HuggingFaceImporter(
            cortexgrid.model_config(deployment)[BASE_MODEL_PARAM], Text2Text
        )
        path = cortexgrid.load_model(
            base_model.family, base_model.suffix, cortexgrid.IMPORTED
        )
        self._device = detect_device()
        self._tokenizer = AutoTokenizer.from_pretrained(path)
        stretched = AutoConfig.from_pretrained(path)
        stretched.rope_parameters = {
            **stretched.rope_parameters,
            "rope_type": "yarn",
            "factor": _YARN_STRETCH,
            "original_max_position_embeddings": _NATIVE_CONTEXT_OF_QWEN3,
        }
        stretched.max_position_embeddings = int(
            _NATIVE_CONTEXT_OF_QWEN3 * _YARN_STRETCH
        )
        self._model = AutoModelForCausalLM.from_pretrained(
            str(path), config=stretched, dtype=torch.bfloat16
        )
        self._model.to(self._device)
        self._model.eval()
        self._option_a_ids = _first_tokens_of(
            self._tokenizer, _ANSWERS_THAT_PICK_OPTION_A
        )
        self._option_b_ids = _first_tokens_of(
            self._tokenizer, _ANSWERS_THAT_PICK_OPTION_B
        )
        self._one_story_at_a_time = threading.Lock()
        self._story_last_read: tuple[str, DynamicCache] | None = None

    def _story_read(self, the_story: str) -> DynamicCache:
        if self._story_last_read is None or self._story_last_read[0] != the_story:
            story_ids = self._tokenizer(
                the_story, return_tensors="pt", add_special_tokens=False
            ).input_ids.to(self._device)
            self._story_last_read = (the_story, read_the_story(self._model, story_ids))
        return self._story_last_read[1]

    def _answer_logits(self, story: str, question: str) -> torch.Tensor:
        the_story, the_question = _asked_of_the_story(self._tokenizer, story, question)
        question_ids = self._tokenizer(
            the_question, return_tensors="pt", add_special_tokens=False
        ).input_ids.to(self._device)
        return answer_logits_after_the_story(
            self._model, self._story_read(the_story), question_ids
        )

    @_app.post("/causal_effects")
    def causal_effects(self, body: dict[str, Any]) -> StreamingResponse:
        return StreamingResponse(
            self._causal_effects(body["story"], body["causes_and_effects"]),
            media_type="text/plain",
        )

    def _causal_effects(
        self, story: str, causes_and_effects: list[list[str]]
    ) -> Iterator[str]:
        with self._one_story_at_a_time:
            for cause, effect in causes_and_effects:
                if_it_took_place, if_it_did_not_take_place = (
                    probability_of_increase(
                        self._answer_logits(
                            story,
                            _QUESTION_ABOUT_CAUSE_AND_EFFECT.format(
                                cause=cause,
                                happening=happening,
                                effect=effect,
                                **_INCREASE_AS_OPTION_A,
                            ),
                        ),
                        self._answer_logits(
                            story,
                            _QUESTION_ABOUT_CAUSE_AND_EFFECT.format(
                                cause=cause,
                                happening=happening,
                                effect=effect,
                                **_INCREASE_AS_OPTION_B,
                            ),
                        ),
                        self._option_a_ids,
                        self._option_b_ids,
                    )
                    for happening in (_TOOK_PLACE, _DID_NOT_TAKE_PLACE)
                )
                yield f"{if_it_took_place - if_it_did_not_take_place}\n"


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
