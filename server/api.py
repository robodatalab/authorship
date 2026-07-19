import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen3.5-4B"


class Engine:
    def __init__(self, model_id: str = MODEL) -> None:
        self.model_id = model_id
        self.status = "downloading"
        self.tokenizer = None
        self.model = None

    def load(self) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_id, dtype=torch.bfloat16, device_map="mps"
        )
        self.model.eval()
        self.status = "ready"

    def infer(self, prompt: str, max_new_tokens: int = 1024) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        with torch.no_grad():
            output = self.model.generate(
                **inputs, max_new_tokens=max_new_tokens, do_sample=False
            )
        return self.tokenizer.decode(
            output[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=True
        )


class RunRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 1024


app = FastAPI()
engine = Engine()


@app.get("/health")
def health() -> dict:
    return {"status": engine.status, "model": engine.model_id}


@app.post("/run")
def run(request: RunRequest) -> dict:
    return {"output": engine.infer(request.prompt, request.max_new_tokens)}
