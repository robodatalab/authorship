import abc
import asyncio
import threading


class Job(abc.ABC):
    """A cancellable unit of work of a named kind, keyed by the file it produces."""

    kind: str

    def __init__(self, target: str) -> None:
        self.target = target
        self.error: str | None = None
        self._cancelled = False
        self._begun = False
        self._done = False

    @property
    def cancelled(self) -> bool:
        return self._cancelled

    @property
    def done(self) -> bool:
        return self._done

    @property
    def status(self) -> str:
        """Waiting for a worker, holding one, or finished with."""
        if self.done:
            return "done"
        return "running" if self._begun else "pending"

    def cancel(self) -> None:
        self._cancelled = True

    def begin(self) -> None:
        self._begun = True

    def finish(self) -> None:
        self._done = True

    @abc.abstractmethod
    async def execute(self) -> None:
        pass


class ParallelJobsManager:
    """The job in flight, or the last one finished, per target file. Starting a
    job for a target that already has one supersedes it — the newer write wins.
    A finished job lingers so its result can be polled, until it is replaced.

    Jobs run on an event loop of the manager's own, so that a job outlives the
    request that started it and can await the models it talks to."""

    def __init__(self) -> None:
        self._by_target: dict[str, Job] = {}
        self._loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop.run_forever, daemon=True).start()

    def start(self, job: Job) -> Job:
        superseded = self._by_target.get(job.target)
        self._by_target[job.target] = job
        if superseded is not None:
            superseded.cancel()
        asyncio.run_coroutine_threadsafe(self._run(job), self._loop)
        return job

    def get(self, target: str) -> Job | None:
        return self._by_target.get(target)

    def is_running(self, target: str) -> bool:
        job = self.get(target)
        return job is not None and not job.done

    def queued(self) -> list[Job]:
        """Every job still waiting for a worker or running on one."""
        return [job for job in self._by_target.values() if not job.done]

    async def _run(self, job: Job) -> None:
        job.begin()
        try:
            await job.execute()
        except Exception as err:
            job.error = str(err)
        finally:
            job.finish()
