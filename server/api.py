"""Backend API."""

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from server import log, story_graph
from server.inference.completion import CompletionModel
from server.representations import Infer, ScenePerspective
from server.representations.builder import RepresentationBuildLifetimeManager


_log = log.logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _log.info("Starting a CompletionModel")
    app.state.completion_model = CompletionModel.start()
    _log.info("CompletionModel created")

    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    """Answers in every state, including mid-download. This is what the frontend
    polls, so it must never touch the model or the queues.

    It carries more than the status word because that word alone could not
    distinguish a worker still loading from one that died saying `loading`.
    """
    instance: Worker = app.state.worker
    return {
        "status": instance.status,
        "pid": instance.pid,
        "alive": instance.alive,
        "seconds": round(instance.seconds_in_status, 1),
    }


class RunRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 1024


@app.post("/run")
def run(request: RunRequest) -> dict[str, str]:
    instance: Worker = app.state.worker
    if instance.status != inference_server.READY:
        raise HTTPException(status_code=503, detail=f"Model is {instance.status}.")
    return {"output": instance.infer(request.prompt, request.max_new_tokens)}


class RepresentationBuildRequest(BaseModel):
    # Path of the document
    path: str


@app.post("/build")
def build(request: RepresentationBuildRequest) -> dict[str, Any]:
    """Generate representations of a manuscript."""
    instance: Worker = app.state.worker
    if instance.status != inference_server.READY:
        _log.info(
            "refused build of %s: worker is %s (%.0fs)",
            Path(request.path).name,
            instance.status,
            instance.seconds_in_status,
        )
        raise HTTPException(status_code=503, detail=f"Model is {instance.status}.")

    document = Path(request.path)
    try:
        story_markdown = document.read_text(encoding="utf-8")
    except OSError as error:
        _log.warning("cannot read %s: %s", document, error)
        raise HTTPException(status_code=400, detail=str(error)) from error

    _log.info("build %s (%d lines)", document.name, len(story_markdown.splitlines()))
    started = time.monotonic()

    representation_build: Builds = app.state.builds
    current = representation_build.start(document)
    try:
        graphs = []
        perspectives = [ScenePerspective(current.infer)]
        for perspective in perspectives:
            name = type(perspective).__name__
            at = time.monotonic()
            try:
                graph = perspective.process(story_markdown)
            except ValueError as error:
                # An unusable reply leaves the existing graph file alone.
                _log.warning(
                    "%s failed after %.1fs: %s", name, time.monotonic() - at, error
                )
                raise HTTPException(status_code=502, detail=str(error)) from error
            _log.info(
                "%s produced %d nodes, %d edges in %.1fs",
                name,
                len(graph.nodes),
                len(graph.edges),
                time.monotonic() - at,
            )
            graphs.append(graph)

        # Between perspectives as well as inside them: a build abandoned after
        # its last reply arrived is still not the one that gets to write.
        current.check()

        target = graph_path_for(document)
        target.write_text(story_graph.to_yaml(graphs), encoding="utf-8")
        _log.info(
            "wrote %s, %d layers, build took %.1fs",
            target.name,
            len(graphs),
            time.monotonic() - started,
        )
    except Superseded as error:
        _log.info(
            "gave up on %s after %.1fs: %s",
            document.name,
            time.monotonic() - started,
            error,
        )
        raise HTTPException(status_code=409, detail=str(error)) from None
    finally:
        registry.finish(current)

    return {
        "path": str(target),
        "layers": [
            {"nodes": len(graph.nodes), "edges": len(graph.edges)} for graph in graphs
        ],
    }
