from __future__ import annotations

import cortexgrid
from cortexgrid_infer import Importer

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
