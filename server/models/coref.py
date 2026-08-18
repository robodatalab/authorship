"""Coreference resolution, served like every other model the server holds.

A model kind cannot be declared where it is used: the serving process is spawned
rather than forked, so it re-imports the class by name and would not find one
declared in a notebook or under `__main__`.
"""

from functools import partial

from vramen.resource_manager import ModelKind, ModelNotAvailable
from transformers import AutoConfig

from server import log

_log = log.logger(__name__)


class _EagerAttention:
    """Stands in for `AutoConfig` while the coreference model loads.

    Longformer's sliding-window attention never moved to the interface transformers
    dispatches through, so eager is the only implementation the architecture has.
    Saying so has to happen here because the config is both made and spent inside the
    constructor, which takes no argument for it.
    """

    @staticmethod
    def from_pretrained(*args, **kwargs):
        return AutoConfig.from_pretrained(
            *args, **{**kwargs, "attn_implementation": "eager"}
        )


def _registered_the_way_transformers_expects(model_class):
    """Have the model finish building itself the way the library it is loaded by expects.

    It was written when `init_weights` was the last thing a model did for itself.
    Since then that work moved to `post_init`, which is where the tied weight keys,
    the parallelism plans and the load-time ignore lists are now registered — and
    `from_pretrained` reads all of them back.
    """
    built = model_class.__init__

    def __init__(self, config):
        built(self, config)
        self.post_init()

    model_class.__init__ = __init__


class CorefModel(ModelKind):
    """The mentions of a thing, gathered under the thing rather than under the words."""

    def load(self):
        # Imported here rather than at the top of the file: `load` runs in the serving
        # process, so the package is only wanted where the model itself is, and vramen
        # stays free of it.
        from fastcoref import LingMessCoref, modeling
        from fastcoref.coref_models.modeling_lingmess import LingMessModel

        _registered_the_way_transformers_expects(LingMessModel)

        standard = modeling.AutoConfig
        modeling.AutoConfig = _EagerAttention
        try:
            return LingMessCoref(model_name_or_path=self.model_id, device="cpu"), None
        finally:
            modeling.AutoConfig = standard

    def clusters(self, text: str) -> list[list[tuple[int, int]]]:
        """Character spans of `text`, grouped so that one group is one thing."""
        with self.manager.residency(self) as (requests, replies):
            requests.put(partial(_resolve, text))
            error, found = replies.get()
        if error is not None:
            raise ModelNotAvailable(f"{self.model_id} failed to resolve: {error}")

        _log.info("resolved %d characters into %d clusters", len(text), len(found))
        return found


# Module level for the same reason the class is: the request is pickled onto a queue
# and unpickled on the other side of a process boundary.
def _resolve(text, model, tokenizer):
    return model.predict(texts=[text])[0].get_clusters(as_strings=False)
