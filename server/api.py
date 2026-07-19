"""HTTP surface. Loopback only — the manuscript does not leave the machine."""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .engine import DEFAULT_MODEL, Engine, parse_json
from .tasks import TASKS, numbered

app = FastAPI()
engine = Engine(DEFAULT_MODEL)


class RunRequest(BaseModel):
    task: str
    text: str
    max_new_tokens: int = 1024


@app.get("/health")
def health() -> dict:
    return {
        "status": "ready" if engine.ready else "loading",
        "model": engine.model_id,
        "tasks": sorted(TASKS),
    }


@app.post("/run")
def run(request: RunRequest) -> dict:
    if not engine.ready:
        raise HTTPException(status_code=503, detail="Model is still loading.")

    task = TASKS.get(request.task)
    if task is None:
        raise HTTPException(status_code=400, detail=f"Unknown task '{request.task}'.")

    result = engine.generate(
        system=task.system,
        prompt=task.prompt(numbered(request.text)),
        max_new_tokens=request.max_new_tokens,
    )

    # `raw` is returned alongside the parse so a failure can be read rather than
    # guessed at — with an untuned model that is most of the debugging.
    return {
        "task": request.task,
        "output": parse_json(result["raw"]),
        "raw": result["raw"],
        "usage": result["usage"],
    }
