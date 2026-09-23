from __future__ import annotations

import hashlib
import threading
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
from transformers import (
    AutoConfig,
    AutoModelForCausalLM,
    AutoTokenizer,
    DynamicCache,
    PreTrainedModel,
)

from server.models import cluster

_app = FastAPI()

STORY_PLOT_CLASSIFIER_FAMILY = "Authorship"
STORY_PLOT_CLASSIFIER_SUFFIX = "storyplotclassifier"
STORY_PLOT_CLASSIFIER_NAME = (
    f"{STORY_PLOT_CLASSIFIER_FAMILY}-{STORY_PLOT_CLASSIFIER_SUFFIX}"
)
STORY_PLOT_CLASSIFIER_BASE_MODEL = "Qwen/Qwen3-8B"
BASE_MODEL_PARAM = "base_model"

STORY_PLOT_CLASSIFIER_INSTRUCTION = (
    "You read a whole novel, then one plot of it and one paragraph of it. A plot "
    "is a thread the story follows: the characters in it, how it began, what it "
    "is heading for, and what has happened along it so far. Say whether the "
    "paragraph belongs to that plot - whether it moves the thread on, shows it, "
    "or is shaped by it. A paragraph that belongs to no plot, such as a "
    "description of the scenery, does not belong to this one either. Answer yes "
    "or no."
)

_WHERE_THE_STORY_ENDS = "\ue010"
_ANSWERS_THAT_MEAN_YES = ("yes", "Yes", " yes", " Yes")
_ANSWERS_THAT_MEAN_NO = ("no", "No", " no", " No")
_NATIVE_CONTEXT_OF_QWEN3 = 32768
_YARN_STRETCH = 4.0


@dataclass(frozen=True)
class StoryPlotQuestion:
    plot: str
    paragraph: str


def _asked_of_the_story(
    tokenizer: Any, story: str, question: StoryPlotQuestion
) -> tuple[str, str]:
    rendered = tokenizer.apply_chat_template(
        [
            {"role": "system", "content": STORY_PLOT_CLASSIFIER_INSTRUCTION},
            {
                "role": "user",
                "content": f"<story>\n{story}\n</story>\n\n{_WHERE_THE_STORY_ENDS}"
                f"<plot>\n{question.plot}\n</plot>\n\n"
                f"<paragraph>\n{question.paragraph}\n</paragraph>\n\n"
                "Does the paragraph belong to the plot?",
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


def probability_of_yes(
    answer_logits: torch.Tensor, yes_ids: list[int], no_ids: list[int]
) -> float:
    log_probabilities = torch.log_softmax(answer_logits.float(), dim=-1)
    yes = torch.logsumexp(log_probabilities[yes_ids], dim=0)
    no = torch.logsumexp(log_probabilities[no_ids], dim=0)
    return float(torch.sigmoid(yes - no))


def base_model_importer(model_id: str) -> HuggingFaceImporter:
    return HuggingFaceImporter(model_id, Text2Text)


def deploy_story_plot_classifier() -> cortexgrid.Deployment:
    cortexgrid.register_model(
        StoryPlotClassifier,
        family=STORY_PLOT_CLASSIFIER_FAMILY,
        suffix=STORY_PLOT_CLASSIFIER_SUFFIX,
        requirements=StoryPlotClassifier.requirements(),
    )
    return cortexgrid.deploy_model(
        family=STORY_PLOT_CLASSIFIER_FAMILY,
        suffix=STORY_PLOT_CLASSIFIER_SUFFIX,
        run_name=cortexgrid.IMPORTED,
        timeout=cluster.DEPLOY_TIMEOUT_S,
        config={BASE_MODEL_PARAM: STORY_PLOT_CLASSIFIER_BASE_MODEL},
    )


@serve.ingress(_app)
class StoryPlotClassifier:
    @classmethod
    def requirements(cls) -> cortexgrid.ModelRequirements:
        return cortexgrid.ModelRequirements(num_gpus=1, ram_gb=20.0, vram_gb=32.0)

    @classmethod
    def client(cls, url: str, name: str) -> ServedStoryPlotClassifier:
        return ServedStoryPlotClassifier(url=url, model_id=name)

    def __init__(self, deployment: cortexgrid.DeploymentKey) -> None:
        base_model = base_model_importer(
            cortexgrid.model_config(deployment)[BASE_MODEL_PARAM]
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
        self._yes_ids = _first_tokens_of(self._tokenizer, _ANSWERS_THAT_MEAN_YES)
        self._no_ids = _first_tokens_of(self._tokenizer, _ANSWERS_THAT_MEAN_NO)
        self._one_story_at_a_time = threading.Lock()
        self._story_last_read: tuple[str, DynamicCache] | None = None

    def _story_read(self, the_story: str) -> DynamicCache:
        fingerprint = hashlib.sha256(the_story.encode("utf-8")).hexdigest()
        if self._story_last_read is None or self._story_last_read[0] != fingerprint:
            story_ids = self._tokenizer(
                the_story, return_tensors="pt", add_special_tokens=False
            ).input_ids.to(self._device)
            self._story_last_read = (fingerprint, read_the_story(self._model, story_ids))
        return self._story_last_read[1]

    @_app.post("/probabilities")
    def probabilities(self, body: dict[str, Any]) -> dict[str, list[float]]:
        questions = [StoryPlotQuestion(**asked) for asked in body["questions"]]
        answers: list[float] = []
        with self._one_story_at_a_time:
            for question in questions:
                the_story, the_question = _asked_of_the_story(
                    self._tokenizer, body["story"], question
                )
                question_ids = self._tokenizer(
                    the_question, return_tensors="pt", add_special_tokens=False
                ).input_ids.to(self._device)
                answers.append(
                    probability_of_yes(
                        answer_logits_after_the_story(
                            self._model, self._story_read(the_story), question_ids
                        ),
                        self._yes_ids,
                        self._no_ids,
                    )
                )
        return {"probabilities": answers}


@dataclass
class ServedStoryPlotClassifier(DeployedModel):
    url: str
    model_id: str

    @property
    def name(self) -> str:
        return self.model_id

    async def probabilities(
        self, story: str, questions: list[StoryPlotQuestion]
    ) -> list[float]:
        async with httpx.AsyncClient(timeout=None) as client:
            response = await client.post(
                f"{self.url}/probabilities",
                json={
                    "story": story,
                    "questions": [
                        {"plot": question.plot, "paragraph": question.paragraph}
                        for question in questions
                    ],
                },
            )
            response.raise_for_status()
            return response.json()["probabilities"]
