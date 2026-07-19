from typing import Any, Protocol

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    PreTrainedTokenizerBase,
)

MODEL = "Qwen/Qwen3.5-4B"


class GenerativeModel(Protocol):
    @property
    def device(self) -> torch.device: ...

    def generate(self, **kwargs: Any) -> Any: ...


class Engine:
    def __init__(self, model, tokenizer: PreTrainedTokenizerBase) -> None:
        self.model = model
        self.tokenizer = tokenizer

    @classmethod
    def start(cls, model_id: str = MODEL) -> "Engine":
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = AutoModelForCausalLM.from_pretrained(
            model_id, dtype=torch.bfloat16, device_map="mps"
        )
        model.eval()
        return cls(model, tokenizer)

    def infer(self, prompt: str, max_new_tokens: int = 1024) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        output = self.model.generate(
            **inputs, max_new_tokens=max_new_tokens, do_sample=False
        )
        text = self.tokenizer.decode(
            output[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=True
        )
        return text if isinstance(text, str) else "".join(text)


class RunRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 1024


app = FastAPI()
app.state.engine = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ready" if app.state.engine else "downloading",
        "model": MODEL,
    }


@app.post("/run")
def run(request: RunRequest) -> dict:
    if app.state.engine is None:
        raise HTTPException(status_code=503, detail="Model is still downloading.")
    return {"output": app.state.engine.infer(request.prompt, request.max_new_tokens)}
