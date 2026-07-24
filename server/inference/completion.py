import abc
import multiprocessing
import os
import threading
import time
from typing import Callable
from multiprocessing.queues import Queue

from huggingface_hub import snapshot_download
from server import log
from server.inference.monitoring import reporting_tqdm, TextStreamerProgressMonitor
from server.inference.utils import qwen_chat_prompt
import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    PreTrainedTokenizerBase,
)

_log = log.logger(__name__)
os.environ.setdefault("HF_DEACTIVATE_ASYNC_LOAD", "1")

MODEL = "Qwen/Qwen3.5-4B"
DOWNLOADED = "downloaded"
PromptFormatter = Callable[[str, str], str]


class CompletionModelState(abc.ABC):
    @abc.abstractmethod
    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        pass

    @abc.abstractmethod
    def status(self) -> str:
        pass

    @abc.abstractmethod
    def cleanup(self) -> None:
        pass


class CompletionModel:
    def __init__(self, model_id: str, prompt_formatter: PromptFormatter) -> None:
        self.prompt_formatter = prompt_formatter
        self.state: CompletionModelState = CompletionModelLoading(self, model_id)

    def set_state(self, state: CompletionModelState) -> None:
        self.state.cleanup()
        self.state = state

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        return self.state.complete(system, user, max_new_tokens)

    def status(self) -> str:
        return self.state.status()


class ModelNotAvailable(Exception):
    pass


class CompletionModelLoading(CompletionModelState):
    def __init__(self, controller: CompletionModel, model_id: str) -> None:
        self.controller = controller
        self.model_id = model_id
        self.progress = 0.0
        self.downloaded: Queue[float | str] = multiprocessing.Queue()
        self.download_process = multiprocessing.Process(
            target=download_process_main,
            kwargs=dict(signal=self.downloaded, model_id=model_id),
            daemon=True,
        )
        self.download_process.start()

        self.monitor_thread = threading.Thread(
            target=monitor_thread_main,
            kwargs=dict(loading=self, model_id=model_id),
            daemon=True,
        )
        self.monitor_thread.start()

    def cleanup(self) -> None:
        self.download_process.join()

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        raise ModelNotAvailable(f"Completion model '{self.model_id}' is loading")

    def status(self) -> str:
        return f"{self.model_id}: {self.progress:.0%} downloaded"


def download_process_main(signal: Queue[float | str], model_id: str) -> None:
    """Child process: pull every weight file into the cache, then report back."""
    log.setup()
    _log.info("downloading %s", model_id)
    started = time.monotonic()
    snapshot_download(model_id, tqdm_class=reporting_tqdm(signal))
    _log.info("downloaded %s in %.0fs", model_id, time.monotonic() - started)
    signal.put(DOWNLOADED)


def monitor_thread_main(loading: CompletionModelLoading, model_id: str) -> None:
    """Track the download's progress, then load the model in this process."""
    while True:
        message = loading.downloaded.get()
        if message == DOWNLOADED:
            break
        loading.progress = float(message)

    _log.info("download complete, loading %s in-process", model_id)
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(
        model_id, dtype=torch.bfloat16, device_map="mps"
    )
    model.eval()

    controller = loading.controller
    controller.set_state(CompletionModelServing(controller, model, tokenizer))


class CompletionModelServing(CompletionModelState):
    def __init__(
        self, 
        controller: CompletionModel, 
        model, 
        tokenizer: PreTrainedTokenizerBase,
    ) -> None:
        self.controller = controller
        self.model = model
        self.tokenizer = tokenizer

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        prompt = self.controller.prompt_formatter(system, user)
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        prompt_tokens = int(inputs["input_ids"].shape[-1])

        _log.info(
            "generating: %d prompt tokens, up to %d new", prompt_tokens, max_new_tokens
        )
        started = time.monotonic()

        streamer = TextStreamerProgressMonitor(self.tokenizer, max_new_tokens)
        output = self.model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            streamer=streamer,
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

    def status(self) -> str:
        return "serving"

    def cleanup(self) -> None:
        pass
