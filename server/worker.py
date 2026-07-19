"""Runs in a child process. Owns the weights and answers inference requests.

Nothing here is imported by the parent at request time — the parent never loads
a model, so its event loop is always free to answer /health.
"""

from multiprocessing.queues import Queue
from typing import Any, Protocol

import torch
from huggingface_hub import snapshot_download
from huggingface_hub.errors import LocalEntryNotFoundError
from transformers import AutoModelForCausalLM, AutoTokenizer, PreTrainedTokenizerBase

DOWNLOADING = "downloading"
LOADING = "loading"
READY = "ready"


class GenerativeModel(Protocol):
    @property
    def device(self) -> torch.device: ...

    def generate(self, **kwargs: Any) -> Any: ...


class Engine:
    def __init__(
        self, model: GenerativeModel, tokenizer: PreTrainedTokenizerBase
    ) -> None:
        self.model = model
        self.tokenizer = tokenizer

    @classmethod
    def start(cls, model_id: str) -> "Engine":
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        model = AutoModelForCausalLM.from_pretrained(
            model_id, dtype=torch.bfloat16, device_map="mps"
        )
        model.eval()
        return cls(model, tokenizer)

    def infer(self, prompt: str, max_new_tokens: int) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        output = self.model.generate(
            **inputs, max_new_tokens=max_new_tokens, do_sample=False
        )
        text = self.tokenizer.decode(
            output[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=True
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
    if not is_downloaded(model_id):
        status.put(DOWNLOADING)
        snapshot_download(model_id)

    status.put(LOADING)
    engine = Engine.start(model_id)
    status.put(READY)

    while True:
        request = requests.get()
        if request is None:
            return
        responses.put(engine.infer(request["prompt"], request["max_new_tokens"]))
