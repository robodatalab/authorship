from __future__ import annotations

import cortexgrid
from cortexgrid_infer import DeployedModel, Importer

EXPERIMENT_NAME = "authorship"
IMPORT_TIMEOUT_S = 3600.0
DEPLOY_TIMEOUT_S = 3600.0


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


def deploy(importer: Importer, **settings: str) -> DeployedModel:
    cortexgrid.Experiment.init(EXPERIMENT_NAME)
    cortexgrid.remote(
        import_weights,
        importer,
        importer.requirements(),
        {**importer.config(), **settings},
        num_gpus=0,
        num_cpus=2,
    ).result(timeout=IMPORT_TIMEOUT_S)
    deployment = cortexgrid.deploy_model(
        importer.family,
        importer.suffix,
        cortexgrid.IMPORTED,
        wait=True,
        timeout=DEPLOY_TIMEOUT_S,
    )
    return importer.client(deployment.url)
