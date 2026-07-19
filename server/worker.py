"""Runs in a child process. Owns the weights and answers inference requests.

Nothing here is imported by the parent at request time — the parent never loads
a model, so its event loop is always free to answer /health.
"""

import time
from multiprocessing.queues import Queue
from typing import Any, Protocol

import torch
from huggingface_hub import snapshot_download
from huggingface_hub.errors import LocalEntryNotFoundError
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    PreTrainedTokenizerBase,
    TextStreamer,
)

from . import log

DOWNLOADING = "downloading"
LOADING = "loading"
READY = "ready"

#: How often generation reports in. Often enough to see it moving, rare enough
#: not to bury the rest of the log.
PROGRESS_EVERY = 64

_log = log.logger(__name__)


class GenerativeModel(Protocol):
    @property
    def device(self) -> torch.device: ...

    def generate(self, **kwargs: Any) -> Any: ...


class Progress(TextStreamer):
    """Reports generation as it happens.

    `generate` blocks until the whole answer exists, so without this the log
    goes silent for however long the model takes and there is no telling a slow
    run from a wedged one. `TextStreamer` is called synchronously as tokens are
    produced, so no thread is involved.
    """

    def __init__(self, tokenizer: PreTrainedTokenizerBase, budget: int) -> None:
        super().__init__(tokenizer, skip_prompt=True, skip_special_tokens=True)
        self.budget = budget
        self.tokens = 0
        self.started = time.monotonic()

    def on_finalized_text(self, text: str, stream_end: bool = False) -> None:
        self.tokens += 1
        if self.tokens % PROGRESS_EVERY == 0:
            elapsed = time.monotonic() - self.started
            _log.info(
                "generating %d/%d tokens, %.0fs elapsed, %.1f tok/s",
                self.tokens,
                self.budget,
                elapsed,
                self.tokens / elapsed if elapsed else 0.0,
            )


class Engine:
    def __init__(
        self, model: GenerativeModel, tokenizer: PreTrainedTokenizerBase
    ) -> None:
        self.model = model
        self.tokenizer = tokenizer

    @classmethod
    def start(cls, model_id: str) -> "Engine":
        started = time.monotonic()
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        _log.info("tokenizer ready, loading weights onto mps")

        model = AutoModelForCausalLM.from_pretrained(
            model_id, dtype=torch.bfloat16, device_map="mps"
        )
        model.eval()
        _log.info("weights loaded in %.1fs", time.monotonic() - started)
        return cls(model, tokenizer)

    def infer(self, prompt: str, max_new_tokens: int) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        prompt_tokens = int(inputs["input_ids"].shape[-1])

        # Prefill is the long silence before the first token, and it grows with
        # the prompt — worth naming its size before it starts.
        _log.info(
            "generating: %d prompt tokens, up to %d new", prompt_tokens, max_new_tokens
        )
        started = time.monotonic()

        streamer = Progress(self.tokenizer, max_new_tokens)
        output = self.model.generate(
            **inputs, max_new_tokens=max_new_tokens, do_sample=False, streamer=streamer
        )

        generated = int(output[0].shape[-1]) - prompt_tokens
        elapsed = time.monotonic() - started
        _log.info(
            "generated %d tokens in %.1fs (%.1f tok/s)%s",
            generated,
            elapsed,
            generated / elapsed if elapsed else 0.0,
            " — hit the budget" if generated >= max_new_tokens else "",
        )

        text = self.tokenizer.decode(
            output[0][prompt_tokens:], skip_special_tokens=True
        )
        return text if isinstance(text, str) else "".join(text)


def is_downloaded(model_id: str) -> bool:
    """Ask the hub whether every file is already local.

    `local_files_only` raises rather than reaching the network, and the partial
    case raises too — `IncompleteSnapshotError` derives from the same error — so
    an interrupted download is correctly reported as still needing one.
    """
    try:
        snapshot_download(model_id, local_files_only=True)
        return True
    except LocalEntryNotFoundError:
        return False


def run(
    model_id: str,
    status: "Queue[str]",
    requests: "Queue[dict[str, Any] | None]",
    responses: "Queue[str]",
) -> None:
    log.setup()

    if not is_downloaded(model_id):
        _log.info("%s is not in the cache, downloading", model_id)
        status.put(DOWNLOADING)
        started = time.monotonic()
        snapshot_download(model_id)
        _log.info("downloaded in %.0fs", time.monotonic() - started)

    status.put(LOADING)
    engine = Engine.start(model_id)
    status.put(READY)
    _log.info("ready")

    while True:
        request = requests.get()
        if request is None:
            _log.info("stopping")
            return
        responses.put(engine.infer(request["prompt"], request["max_new_tokens"]))
