import abc
from concurrent.futures import ThreadPoolExecutor
import threading


class Job(abc.ABC):
    """A cancellable unit of work of a named kind, keyed by the file it produces."""

    kind: str

    def __init__(self, target: str) -> None:
        self.target = target
        self.error: str | None = None
        self._cancel = threading.Event()
        self._begun = threading.Event()
        self._done = threading.Event()

    @property
    def cancelled(self) -> bool:
        return self._cancel.is_set()

    @property
    def done(self) -> bool:
        return self._done.is_set()

    @property
    def status(self) -> str:
        """Waiting for a worker, holding one, or finished with."""
        if self.done:
            return "done"
        return "running" if self._begun.is_set() else "pending"

    def cancel(self) -> None:
        self._cancel.set()

    def begin(self) -> None:
        self._begun.set()

    def finish(self) -> None:
        self._done.set()

    @abc.abstractmethod
    def execute(self) -> None:
        pass



class ParallelJobsManager:
    """The job in flight, or the last one finished, per target file. Starting a
    job for a target that already has one supersedes it — the newer write wins.
    A finished job lingers so its result can be polled, until it is replaced."""

    def __init__(self) -> None:
        self._pool = ThreadPoolExecutor()
        self._by_target: dict[str, Job] = {}
        self._lock = threading.Lock()

    def start(self, job: Job) -> Job:
        with self._lock:
            superseded = self._by_target.get(job.target)
            self._by_target[job.target] = job
        if superseded is not None:
            superseded.cancel()
        self._pool.submit(self._run, job)
        return job

    def get(self, target: str) -> Job | None:
        with self._lock:
            return self._by_target.get(target)

    def is_running(self, target: str) -> bool:
        job = self.get(target)
        return job is not None and not job.done

    def queued(self) -> list[Job]:
        """Every job still waiting for a worker or running on one."""
        with self._lock:
            return [job for job in self._by_target.values() if not job.done]

    def _run(self, job: Job) -> None:
        job.begin()
        try:
            job.execute()
        except Exception as err:
            job.error = str(err)
        finally:
            job.finish()
