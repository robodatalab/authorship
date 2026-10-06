from concurrent.futures import ThreadPoolExecutor

import cortexgrid
from cortexgrid_infer import (
    GeminiText2Text,
    Hosted,
    HuggingFaceImporter,
    TextRewriter,
)
from fastapi import FastAPI

from server import log
from server.models import cluster
from server.models.causal_event_trajectory_classifier import (
    CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_NAME,
    deploy_causal_event_trajectory_classifier,
)
from server.models.long_context_qwen import (
    LONG_CONTEXT_QWEN,
    LONG_CONTEXT_QWEN_DEPLOYMENT,
)
from server.models.story_state_extraction_model import (
    STORY_STATE_EXTRACTION_MODEL_NAME,
    deploy_story_state_extraction_model,
)

_log = log.logger(__name__)

GEC_MODEL = "Unbabel/gec-t5_small"
STYLE_MODEL = "gemini-3.1-pro-preview"

def deploy_inference_models(app: FastAPI) -> None:
    _log.info("Starting the completion models")
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)
    gec_model = HuggingFaceImporter(GEC_MODEL, TextRewriter)
    with ThreadPoolExecutor() as importing:
        imported = {
            importer.model_id: importing.submit(cluster.ensure_weights_imported, importer)
            for importer in (LONG_CONTEXT_QWEN, gec_model)
        }
        imported[LONG_CONTEXT_QWEN.model_id].result()
        causal_deployment = cluster.deploy(
            LONG_CONTEXT_QWEN, **LONG_CONTEXT_QWEN_DEPLOYMENT.config
        )
        app.state.inference_models[LONG_CONTEXT_QWEN.model_id] = causal_deployment.key
        app.state.causal_model = causal_deployment.client()
        imported[GEC_MODEL].result()
        gec_deployment = cluster.deploy(gec_model)
        app.state.inference_models[GEC_MODEL] = gec_deployment.key
        app.state.gec_model = gec_deployment.client()
        style_model = Hosted(STYLE_MODEL, GeminiText2Text)
        cortexgrid.register_model(
            style_model.serve_app,
            family=style_model.family,
            suffix=style_model.suffix,
            requirements=style_model.requirements(),
            config=style_model.config(),
        )
        style_deployment = cortexgrid.deploy_model(
            family=style_model.family,
            suffix=style_model.suffix,
            run_name=cortexgrid.IMPORTED,
            timeout=cluster.DEPLOY_TIMEOUT_S,
        )
        app.state.inference_models[STYLE_MODEL] = style_deployment.key
        app.state.style_model = style_deployment.client()
        causal_event_trajectory_classifier_deployment = deploy_causal_event_trajectory_classifier()
        app.state.inference_models[CAUSAL_EVENT_TRAJECTORY_CLASSIFIER_NAME] = (
            causal_event_trajectory_classifier_deployment.key
        )
        app.state.causal_event_trajectory_classifier = (
            causal_event_trajectory_classifier_deployment.client()
        )
        story_state_extraction_model_deployment = deploy_story_state_extraction_model()
        app.state.inference_models[STORY_STATE_EXTRACTION_MODEL_NAME] = (
            story_state_extraction_model_deployment.key
        )
        app.state.story_state_extraction_model = story_state_extraction_model_deployment.client()
    _log.info("Completion models created")
