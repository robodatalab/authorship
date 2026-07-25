import abc
import time
from typing import Any, Callable

from server import log
from server.inference.monitoring import TextStreamerProgressMonitor
import torch
from transformers import AutoModelForCausalLM, AutoModelForSeq2SeqLM

_log = log.logger(__name__)

PromptFormatter = Callable[[str, str], str]


class ModelKind(abc.ABC):
    @abc.abstractmethod
    def load(self, model_id: str) -> Any:
        pass

    @abc.abstractmethod
    def complete(
        self, model, tokenizer, system: str, user: str, max_new_tokens: int
    ) -> str:
        pass


class CausalModel(ModelKind):
    def __init__(self, prompt: PromptFormatter) -> None:
        self.prompt = prompt

    def load(self, model_id: str):
        model = AutoModelForCausalLM.from_pretrained(
            model_id, dtype=torch.bfloat16, device_map="mps"
        )
        model.eval()
        return model

    def complete(
        self, model, tokenizer, system: str, user: str, max_new_tokens: int
    ) -> str:
        prompt = self.prompt(system, user)
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        prompt_tokens = int(inputs["input_ids"].shape[-1])

        _log.info(
            "generating: %d prompt tokens, up to %d new", prompt_tokens, max_new_tokens
        )
        started = time.monotonic()

        streamer = TextStreamerProgressMonitor(tokenizer, max_new_tokens)
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            streamer=streamer,
        )

        generated = int(output[0].shape[-1]) - prompt_tokens
        elapsed = time.monotonic() - started
        _log.info(
            "generated %d tokens in %.1fs (%.1f tok/s)%s",
            generated,
            elapsed,
            generated / elapsed if elapsed else 0.0,
            " — hit the budget" if generated >= max_new_tokens else "",
        )

        text = tokenizer.decode(output[0][prompt_tokens:], skip_special_tokens=True)
        return text if isinstance(text, str) else "".join(text)


class Seq2SeqModel(ModelKind):
    def __init__(self, prompt: PromptFormatter) -> None:
        self.prompt = prompt

    def load(self, model_id: str):
        model = AutoModelForSeq2SeqLM.from_pretrained(
            model_id, dtype=torch.bfloat16, device_map="mps"
        )
        model.eval()
        return model

    def complete(
        self, model, tokenizer, system: str, user: str, max_new_tokens: int
    ) -> str:
        prompt = self.prompt(system, user)
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

        started = time.monotonic()
        output = model.generate(
            **inputs, max_new_tokens=max_new_tokens, do_sample=False
        )
        _log.info(
            "edited %d tokens in %.1fs",
            int(output[0].shape[-1]),
            time.monotonic() - started,
        )

        text = tokenizer.decode(output[0], skip_special_tokens=True)
        return text if isinstance(text, str) else "".join(text)
