"""Backend API."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from server import log
from server.representations.scene_representation import build_scene_representation
from server.representations.utils import graph_path_for
from server.inference.completion import CompletionModel, ModelNotAvailable
import tenacity

_log = log.logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _log.info("Starting a CompletionModel")
    app.state.completion_model = CompletionModel()
    _log.info("CompletionModel created")

    _log.info("Yielding control to FastAPI server")
    yield
    _log.info("FastAPI server terminated")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    """Is the application healthy and ready to serve traffic"""
    inference_server_status = app.state.completion_model.status()
    # TODO: update the frontend to show the status correctly
    return {
        "inference_server_status": inference_server_status,
    }


class RepresentationBuildRequest(BaseModel):
    # Path of the document
    path: str


@tenacity.retry(
    retry=tenacity.retry_if_exception_type((ValueError, ModelNotAvailable)),
    wait=tenacity.wait_exponential_jitter(initial=1, max=30),
    stop=tenacity.stop_after_attempt(5),
    reraise=True,
)
def _build_representations(model, markdown):
    return [build_scene_representation(model, markdown)]


@app.post("/build")
def build(request: RepresentationBuildRequest) -> dict[str, Any]:
    """Generate representations of a manuscript."""
    document = Path(request.path)
    story_markdown = document.read_text()
    target_graph_file = graph_path_for(document)
    graphs = _build_representations(app.state.completion_model, story_markdown)

    return {
        "path": str(target_graph_file),
        "layers": [
            {"nodes": len(graph.nodes), "edges": len(graph.edges)} for graph in graphs
        ],
    }
