import abc
import multiprocessing
import threading
import time
from multiprocessing.queues import Queue

from server.inference.monitoring import TextStreamerProgressMonitor
import torch
from huggingface_hub import snapshot_download
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    PreTrainedTokenizerBase,
)

from server import log

_log = log.logger(__name__)

MODEL = "Qwen/Qwen3.5-4B"

#: Published by the download process once every weight file is on disk. The
#: monitor thread waits for exactly this and nothing else.
DOWNLOADED = "downloaded"


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
    def __init__(self) -> None:
        self.state: CompletionModelState = CompletionModelLoading(self)

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
    def __init__(self, controller: CompletionModel) -> None:
        self.controller = controller

        # Written by the monitor thread as the download reports in, read by
        # status() from whatever thread asks. A lone float assignment is atomic
        # under the GIL, so the two need no lock between them.
        self.progress = 0.0

        # The download runs in its own process so a multi-gigabyte fetch never
        # shares this process's memory or holds its GIL. Progress fractions and
        # a final DOWNLOADED marker come back over the queue; the files land in
        # the shared HuggingFace cache for the main process to load from.
        self.downloaded: Queue[float | str] = multiprocessing.Queue()
        self.download_process = multiprocessing.Process(
            target=download_process_main,
            kwargs=dict(signal=self.downloaded),
            daemon=True,
        )
        self.download_process.start()

        # A thread rather than a callback so the blocking wait on the process
        # stays off the event loop. When it hears the weights have arrived it
        # loads them here and flips the controller over to serving.
        self.monitor_thread = threading.Thread(
            target=monitor_thread_main,
            kwargs=dict(loading=self),
            daemon=True,
        )
        self.monitor_thread.start()

    def cleanup(self) -> None:
        # The download process has already exited by the time serving takes
        # over, so this returns at once; on any other transition it reaps it.
        # The monitor thread is deliberately not joined: it is the very thread
        # driving this transition, and a thread cannot join itself.
        self.download_process.join()

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        raise ModelNotAvailable("Completion model is loading")

    def status(self) -> str:
        return f"{self.progress:.0%} downloaded"


def download_process_main(signal: "Queue[float | str]") -> None:
    """Child process: pull every weight file into the cache, then report back."""
    log.setup()
    _log.info("downloading %s", MODEL)
    started = time.monotonic()
    snapshot_download(MODEL, tqdm_class=_reporting_tqdm(signal))
    _log.info("downloaded %s in %.0fs", MODEL, time.monotonic() - started)
    signal.put(DOWNLOADED)


def monitor_thread_main(loading: CompletionModelLoading) -> None:
    """Track the download's progress, then load the model in this process."""
    while True:
        message = loading.downloaded.get()
        if message == DOWNLOADED:
            break
        loading.progress = float(message)

    _log.info("download complete, loading %s in-process", MODEL)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL, dtype=torch.bfloat16, device_map="mps"
    )
    model.eval()

    controller = loading.controller
    controller.set_state(CompletionModelServing(controller, model, tokenizer))


def _reporting_tqdm(signal: "Queue[float | str]") -> type:
    """A tqdm subclass that reports the overall fetch fraction to the parent.

    `snapshot_download` drives one bar over the file count and one per file over
    bytes. The file-count bar measures the whole job, so its fraction is what
    gets published; the per-file byte bars (unit "B") report only to the log. If
    the hub ever stops drawing that bar the fraction just stays at zero until
    DOWNLOADED — the transition to serving still fires.
    """
    from tqdm.auto import tqdm

    class ReportingTqdm(tqdm):  # type: ignore[type-arg]
        def update(self, n: float | None = 1) -> bool | None:
            updated = super().update(n)
            if self.unit != "B" and self.total:
                signal.put(min(self.n / self.total, 1.0))
            return updated

    return ReportingTqdm


class CompletionModelServing(CompletionModelState):
    def __init__(
        self, controller: CompletionModel, model, tokenizer: PreTrainedTokenizerBase
    ) -> None:
        self.controller = controller
        self.model = model
        self.tokenizer = tokenizer

    def complete(self, system: str, user: str, max_new_tokens: int) -> str:
        prompt = _qwen_chat_prompt(system, user)
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


def _qwen_chat_prompt(system: str, user: str) -> str:
    """Render a turn the way Qwen's chat template does, with reasoning off."""
    return (
        f"<|im_start|>system\n{system}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )
