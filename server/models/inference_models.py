from concurrent.futures import ThreadPoolExecutor

import cortexgrid
from cortexgrid_infer import (
    GeminiText2Text,
    Hosted,
    HuggingFaceImporter,
    Text2Text,
    TextRewriter,
)
from fastapi import FastAPI

from server import log
from server.models import cluster
from server.story_analysis.story_plot_classifier import (
    STORY_PLOT_CLASSIFIER_BASE_MODEL,
    STORY_PLOT_CLASSIFIER_NAME,
    StoryPlotClassifier,
    deploy_story_plot_classifier,
)

_log = log.logger(__name__)

GEC_MODEL = "Unbabel/gec-t5_small"
CAUSAL_MODEL = "Qwen/Qwen3-8B"
STYLE_MODEL = "gemini-3.1-pro-preview"

def deploy_inference_models(app: FastAPI) -> None:
    _log.info("Starting the completion models")
    cortexgrid.Experiment.init(cluster.EXPERIMENT_NAME)
    causal_model = HuggingFaceImporter(CAUSAL_MODEL, Text2Text)
    gec_model = HuggingFaceImporter(GEC_MODEL, TextRewriter)
    importers = {
        importer.model_id: importer
        for importer in (
            causal_model,
            gec_model,
            HuggingFaceImporter(STORY_PLOT_CLASSIFIER_BASE_MODEL, Text2Text),
        )
    }
    with ThreadPoolExecutor() as importing:
        imported = {
            model_id: importing.submit(cluster.ensure_weights_imported, importer)
            for model_id, importer in importers.items()
        }
        imported[CAUSAL_MODEL].result()
        causal_deployment = cluster.deploy(
            causal_model, enable_thinking="false", max_total_tokens="16384"
        )
        app.state.causal_model = causal_model.client(causal_deployment.url)
        app.state.inference_models[CAUSAL_MODEL] = causal_deployment.key
        imported[GEC_MODEL].result()
        gec_deployment = cluster.deploy(gec_model)
        app.state.gec_model = gec_model.client(gec_deployment.url)
        app.state.inference_models[GEC_MODEL] = gec_deployment.key
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
        app.state.style_model = style_model.client(style_deployment.url)
        app.state.inference_models[STYLE_MODEL] = style_deployment.key
        imported[STORY_PLOT_CLASSIFIER_BASE_MODEL].result()
        story_plot_classifier_deployment = deploy_story_plot_classifier()
        app.state.story_plot_classifier = StoryPlotClassifier.client(
            story_plot_classifier_deployment.url, STORY_PLOT_CLASSIFIER_NAME
        )
        app.state.inference_models[STORY_PLOT_CLASSIFIER_NAME] = (
            story_plot_classifier_deployment.key
        )
    _log.info("Completion models created")
