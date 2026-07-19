"""Model loading and generation.

Weights are downloaded from HuggingFace on first use into the standard cache
(``~/.cache/huggingface/hub``) and loaded onto the Metal backend.
"""

import json
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

DEFAULT_MODEL = "Qwen/Qwen3.5-4B"


class Engine:
    """One model, held in memory for the life of the process."""

    def __init__(self, model_id: str = DEFAULT_MODEL) -> None:
        self.model_id = model_id
        self.tokenizer = None
        self.model = None
        self.ready = False

    def load(self) -> None:
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_id,
            dtype=torch.bfloat16,
            device_map=device,
        )
        self.model.eval()
        self.ready = True

    def generate(self, system: str, prompt: str, max_new_tokens: int = 1024) -> dict:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        text = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self.tokenizer(text, return_tensors="pt").to(self.model.device)

        started = time.monotonic()
        with torch.no_grad():
            output = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                pad_token_id=self.tokenizer.eos_token_id,
            )
        elapsed_ms = int((time.monotonic() - started) * 1000)

        # Only the continuation — everything up to the prompt length is the input
        # echoed back.
        completion = output[0][inputs["input_ids"].shape[-1] :]
        raw = self.tokenizer.decode(completion, skip_special_tokens=True)

        return {
            "raw": raw,
            "usage": {
                "prompt_tokens": int(inputs["input_ids"].shape[-1]),
                "completion_tokens": int(completion.shape[-1]),
                "ms": elapsed_ms,
            },
        }


def parse_json(raw: str):
    """Pull a JSON object out of the model's reply.

    Untuned models wrap JSON in prose or fences often enough that a bare
    ``json.loads`` fails on output that is otherwise fine, so fall back to the
    outermost braces before giving up.
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None
