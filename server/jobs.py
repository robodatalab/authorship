import abc
import asyncio
import functools
import multiprocessing
import os
import threading
from dataclasses import dataclass
from multiprocessing.connection import Connection
from multiprocessing.process import BaseProcess
from typing import Any, Callable, get_type_hints

from fastapi import FastAPI, HTTPException

from server import log
from server.progress import WorkProgress, reporting_progress_to

_log = log.logger(__name__)

_SECONDS_BETWEEN_SNAPSHOTS = 0.2

_PROCESSES = multiprocessing.get_context("spawn")


class Job(abc.ABC):
    """A cancellable unit of work of a named kind, keyed by the file it produces."""

    kind: str

    def __init__(self, target: str) -> None:
        self.target = target
        self.progress = WorkProgress(self.kind)

    @abc.abstractmethod
    async def execute(self) -> None:
        pass

    @abc.abstractmethod
    def snapshot(self) -> dict[str, Any]:
        pass


@dataclass(frozen=True)
class _JobSnapshotSent:
    snapshot: dict[str, Any]


@dataclass(frozen=True)
class _JobFailed:
    error: str


@dataclass
class _JobInItsProcess:
    job: Job
    process: BaseProcess
    snapshot: dict[str, Any]
    begun: bool = False
    done: bool = False
    stopped: bool = False
    error: str | None = None

    @property
    def status(self) -> str:
        """Waiting for a worker, holding one, or finished with."""
        if self.done:
            return "done"
        return "running" if self.begun else "pending"


async def _execute(job: Job) -> None:
    with reporting_progress_to(job.progress):
        await job.execute()


def _exit_once_the_server_is_gone(lifeline: Connection) -> None:
    try:
        lifeline.recv()
    except EOFError:
        pass
    os._exit(1)


def _send_snapshots_until_finished(job: Job, reporting: Connection, finished: threading.Event) -> None:
    while True:
        snapshot = job.snapshot()
        snapshot_sent = _JobSnapshotSent(snapshot)
        reporting.send(snapshot_sent)
        if finished.wait(_SECONDS_BETWEEN_SNAPSHOTS):
            return


def _run_in_its_process(job: Job, reporting: Connection, lifeline: Connection) -> None:
    log.setup()
    watching_the_server = threading.Thread(target=_exit_once_the_server_is_gone, args=(lifeline,), daemon=True)
    watching_the_server.start()
    finished = threading.Event()
    sending = threading.Thread(target=_send_snapshots_until_finished, args=(job, reporting, finished), daemon=True)
    sending.start()
    failure: str | None = None
    try:
        asyncio.run(_execute(job))
    except Exception as err:
        failure = str(err)
        _log.exception("%s failed for %s", job.kind, job.target)
    finished.set()
    sending.join()
    last_snapshot = job.snapshot()
    last_snapshot_sent = _JobSnapshotSent(last_snapshot)
    reporting.send(last_snapshot_sent)
    if failure is not None:
        job_failed = _JobFailed(failure)
        reporting.send(job_failed)
    reporting.close()


class ParallelJobsManager:
    """The job in flight, or the last one finished, per target file. Starting a
    job for a target that already has one supersedes it — the newer write wins.
    A finished job lingers so its result can be polled, until it is replaced.

    Every job runs in a process of its own, so that a job outlives the request
    that started it, stopping or superseding it kills it at once, and it ends
    with the server."""

    def __init__(self) -> None:
        self._by_target: dict[str, _JobInItsProcess] = {}

    def start(self, job: Job) -> Job:
        superseded = self._by_target.get(job.target)
        if superseded is not None and not superseded.done:
            self._kill(superseded)
        reporting_received, reporting_sent = _PROCESSES.Pipe(duplex=False)
        lifeline_watched, lifeline_held = _PROCESSES.Pipe(duplex=False)
        process = _PROCESSES.Process(
            target=_run_in_its_process,
            args=(job, reporting_sent, lifeline_watched),
            daemon=True,
        )
        process.start()
        reporting_sent.close()
        lifeline_watched.close()
        first_snapshot = job.snapshot()
        running = _JobInItsProcess(job, process, first_snapshot)
        self._by_target[job.target] = running
        following = threading.Thread(target=self._follow, args=(running, reporting_received, lifeline_held), daemon=True)
        following.start()
        _log.info("%s started for %s", job.kind, job.target)
        return job

    def get(self, target: str) -> Job | None:
        running = self._by_target.get(target)
        return None if running is None else running.job

    def cancel(self, target: str) -> None:
        running = self._by_target[target]
        if running.done:
            del self._by_target[target]
            return
        self._kill(running)

    def reported(self, target: str) -> dict[str, Any]:
        running = self._by_target[target]
        return {"running": not running.done, "error": running.error, **running.snapshot}

    def in_flight(self) -> list[dict[str, Any]]:
        """Every job still waiting for a worker or running on one."""
        return [
            {
                "kind": running.job.kind,
                "path": running.job.target,
                "status": running.status,
            }
            for running in self._by_target.values()
            if not running.done
        ]

    def _kill(self, running: _JobInItsProcess) -> None:
        running.stopped = True
        running.process.kill()

    def _follow(self, running: _JobInItsProcess, reporting: Connection, lifeline: Connection) -> None:
        while True:
            try:
                message = reporting.recv()
            except EOFError:
                break
            if isinstance(message, _JobSnapshotSent):
                running.snapshot = message.snapshot
                running.begun = True
            elif isinstance(message, _JobFailed):
                running.error = message.error
        running.process.join()
        reporting.close()
        lifeline.close()
        exit_code = running.process.exitcode
        if exit_code != 0 and running.error is None and not running.stopped:
            running.error = f"The {running.job.kind} ended with exit code {exit_code}"
        running.done = True
        _log.info(
            "%s %s for %s",
            running.job.kind,
            "stopped" if running.stopped else "finished",
            running.job.target,
        )



def job_endpoint(app: FastAPI, post: str, get: str) -> Callable[[Callable[..., Job]], Callable[..., Job]]:
    def register_job_endpoints(create_job: Callable[..., Job]) -> Callable[..., Job]:
        type_hints = get_type_hints(create_job)
        job_type = type_hints["return"]

        @functools.wraps(create_job)
        def start_job(*args: Any, **kwargs: Any) -> dict[str, Any]:
            job = create_job(*args, **kwargs)
            app.state.jobs.start(job)
            return {"id": job.target}

        def job_status(id: str) -> dict[str, Any]:
            job = app.state.jobs.get(id)
            if not isinstance(job, job_type):
                raise HTTPException(status_code=404, detail=f"No {job_type.kind} job for {id}")
            status = app.state.jobs.reported(id)
            return status

        register_start_job = app.post(post, status_code=202, response_model=None)
        register_start_job(start_job)
        register_job_status = app.get(get)
        register_job_status(job_status)
        return create_job

    return register_job_endpoints
