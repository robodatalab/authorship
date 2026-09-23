from __future__ import annotations

import logging

import cortexgrid
import httpx
from cortexgrid_infer import Importer
from tenacity import (
    RetryCallState,
    before_sleep_log,
    retry,
    retry_if_exception,
    wait_fixed,
)

from server import log
from server.jobs import the_job_in_hand

_log = log.logger(__name__)

EXPERIMENT_NAME = "authorship"
IMPORT_TIMEOUT_S = 3600.0
DEPLOY_TIMEOUT_S = 3600.0

WHILE_A_MODEL_IS_NOT_THERE = frozenset({502, 503, 504})
WAIT_BETWEEN_TRIES_S = 10.0


def a_model_that_is_not_there_yet(failure: BaseException) -> bool:
    if isinstance(failure, httpx.TransportError):
        return True
    return (
        isinstance(failure, httpx.HTTPStatusError)
        and failure.response.status_code in WHILE_A_MODEL_IS_NOT_THERE
    )


def the_job_was_stopped(asking_again: RetryCallState) -> bool:
    job = the_job_in_hand.get()
    return job is not None and job.cancelled


waiting_for_the_model = retry(
    retry=retry_if_exception(a_model_that_is_not_there_yet),
    stop=the_job_was_stopped,
    wait=wait_fixed(WAIT_BETWEEN_TRIES_S),
    before_sleep=before_sleep_log(_log, logging.WARNING),
    reraise=True,
)


def import_weights(
    importer: Importer,
    requirements: cortexgrid.ModelRequirements,
    config: dict[str, str],
) -> None:
    with importer:
        cortexgrid.import_model(
            importer.source,
            importer.serve_app,
            family=importer.family,
            suffix=importer.suffix,
            requirements=requirements,
            config=config,
        )


def ensure_weights_imported(importer: Importer) -> None:
    imported = cortexgrid.model_registry_status(
        importer.family, importer.suffix, cortexgrid.IMPORTED
    )
    if imported is not None and imported.phase == "ready":
        import_weights(importer, importer.requirements(), importer.config())
        return
    cortexgrid.remote(
        import_weights,
        importer,
        importer.requirements(),
        importer.config(),
        num_gpus=0,
        num_cpus=2,
    ).result(timeout=IMPORT_TIMEOUT_S)


def deploy(importer: Importer, **settings: str) -> cortexgrid.Deployment:
    return cortexgrid.deploy_model(
        family=importer.family,
        suffix=importer.suffix,
        run_name=cortexgrid.IMPORTED,
        timeout=DEPLOY_TIMEOUT_S,
        config=dict(settings),
    )
