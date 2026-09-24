from __future__ import annotations

import time
from collections.abc import AsyncIterable, AsyncIterator, Iterable, Iterator, Sized
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

WorkItem = TypeVar("WorkItem")


@dataclass
class WorkProgress:
    doing: str
    of: int | None = None
    done: int = 0
    began: float | None = None
    ended: float | None = None
    steps: list[WorkProgress] = field(default_factory=list)

    def reported(self) -> dict[str, Any]:
        now = time.monotonic()
        return {
            "doing": self.doing,
            "done": self.done,
            "of": self.of,
            "seconds": 0.0
            if self.began is None
            else round((self.ended if self.ended is not None else now) - self.began, 1),
            "state": "waiting"
            if self.began is None
            else "running"
            if self.ended is None
            else "done",
            "steps": [step.reported() for step in list(self.steps)],
        }


_work_being_done: ContextVar[WorkProgress | None] = ContextVar(
    "work_being_done", default=None
)


@contextmanager
def reporting_progress_to(work: WorkProgress) -> Iterator[None]:
    work.began = time.monotonic()
    reporting = _work_being_done.set(work)
    try:
        yield
    finally:
        work.ended = time.monotonic()
        _work_being_done.reset(reporting)


class WorkItemsInProgress(Generic[WorkItem]):
    def __init__(
        self,
        items: Iterable[WorkItem] | AsyncIterable[WorkItem],
        doing: str,
        of: int | None,
    ) -> None:
        self._items = items
        self._doing = doing
        self._of = of

    def __iter__(self) -> Iterator[WorkItem]:
        assert isinstance(self._items, Iterable)
        work, part_of = self._begin()
        try:
            for item in self._items:
                yield item
                work.done += 1
        finally:
            self._end(work, part_of)

    async def __aiter__(self) -> AsyncIterator[WorkItem]:
        assert isinstance(self._items, AsyncIterable)
        work, part_of = self._begin()
        try:
            async for item in self._items:
                yield item
                work.done += 1
        finally:
            self._end(work, part_of)

    def _begin(self) -> tuple[WorkProgress, WorkProgress | None]:
        work = WorkProgress(self._doing, self._of, began=time.monotonic())
        part_of = _work_being_done.get()
        if part_of is not None:
            part_of.steps.append(work)
        _work_being_done.set(work)
        return work, part_of

    def _end(self, work: WorkProgress, part_of: WorkProgress | None) -> None:
        work.ended = time.monotonic()
        _work_being_done.set(part_of)


def with_progress(
    items: Iterable[WorkItem] | AsyncIterable[WorkItem],
    doing: str,
    of: int | None = None,
) -> WorkItemsInProgress[WorkItem]:
    return WorkItemsInProgress(
        items, doing, len(items) if of is None and isinstance(items, Sized) else of
    )
