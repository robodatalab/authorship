"""Runs in a child process. Owns the weights and answers inference requests.

Nothing here is imported by the parent at request time — the parent never loads
a model, so its event loop is always free to answer /health.
"""

import os
import resource
import sys
import threading
import time
import traceback
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

#: Published when the child cannot go on. Without it a crash during load left
#: the parent reporting `loading` for as long as it stayed up.
FAILED = "failed"

#: How often generation reports in. Often enough to see it moving, rare enough
#: not to bury the rest of the log.
PROGRESS_EVERY = 64

#: How often a long silent call says it is still going.
HEARTBEAT_S = 5.0

_log = log.logger(__name__)


def rss_bytes() -> int:
    """Resident size of this process.

    `ru_maxrss` is bytes on macOS and kilobytes on Linux — one of the older
    inconsistencies in the interface.
    """
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak if sys.platform == "darwin" else peak * 1024


class Heartbeat:
    """Says a long call is still running, and shows it moving.

    Loading is a single opaque call into transformers, so the log has nothing to
    say between entering it and leaving. That makes a slow load and a wedged one
    identical from outside, which is exactly the confusion this is here to end.

    The resident size is what makes it more than a pulse: climbing means weights
    are still arriving. Flat for a minute means stuck. And if the heartbeat
    itself stops while the process is alive, whatever it is stuck in is holding
    the GIL — which is a third diagnosis again.
    """

    def __init__(self, what: str, every: float = HEARTBEAT_S) -> None:
        self.what = what
        self.every = every
        self.started = time.monotonic()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._beat, daemon=True)

    def __enter__(self) -> "Heartbeat":
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()

    def _beat(self) -> None:
        while not self._stop.wait(self.every):
            _log.info(
                "still %s, %.0fs elapsed, rss %.1f GB",
                self.what,
                time.monotonic() - self.started,
                rss_bytes() / 1024**3,
            )


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

        with Heartbeat("loading the tokenizer"):
            tokenizer = AutoTokenizer.from_pretrained(model_id)
        _log.info("tokenizer ready after %.1fs", time.monotonic() - started)

        at = time.monotonic()
        with Heartbeat("loading weights onto mps"):
            model = AutoModelForCausalLM.from_pretrained(
                model_id, dtype=torch.bfloat16, device_map="mps"
            )
            model.eval()

        _log.info(
            "weights loaded in %.1fs, rss %.1f GB (%.1fs since start)",
            time.monotonic() - at,
            rss_bytes() / 1024**3,
            time.monotonic() - started,
        )
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
    log.dump_stacks_on_signal()
    _log.info(
        "worker started, pid %d, model %s — `kill -USR1 %d` to dump its stacks",
        os.getpid(),
        model_id,
        os.getpid(),
    )

    # Nothing above this caught anything, so a failure during load killed the
    # child silently and the parent went on reporting `loading` indefinitely.
    # Whatever goes wrong, it gets said and it gets published.
    try:
        with Heartbeat("checking the cache"):
            cached = is_downloaded(model_id)

        if not cached:
            _log.info("%s is not in the cache, downloading", model_id)
            status.put(DOWNLOADING)
            started = time.monotonic()
            with Heartbeat("downloading"):
                snapshot_download(model_id)
            _log.info("downloaded in %.0fs", time.monotonic() - started)
        else:
            _log.info("%s is already in the cache", model_id)

        status.put(LOADING)
        engine = Engine.start(model_id)
        status.put(READY)
        _log.info("ready, pid %d", os.getpid())
    except BaseException:
        _log.error("worker died during startup:\n%s", traceback.format_exc())
        status.put(FAILED)
        raise

    while True:
        request = requests.get()
        if request is None:
            _log.info("stopping")
            return
        try:
            responses.put(engine.infer(request["prompt"], request["max_new_tokens"]))
        except Exception:
            # The caller is blocked on `responses`. Saying nothing here hangs it
            # for as long as the server lives.
            _log.error("inference failed:\n%s", traceback.format_exc())
            responses.put("")
