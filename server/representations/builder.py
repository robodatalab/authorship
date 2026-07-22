from pathlib import Path
import threading


class Superseded(Exception):
    """Raised inside a build that a newer save has taken the manuscript from."""


class Build:
    """?????"""

    def __init__(self, path: Path, model: Worker) -> None:
        self.path = path
        self._model = model
        self._abandoned = threading.Event()

    @property
    def abandoned(self) -> bool:
        return self._abandoned.is_set()

    def abandon(self) -> None:
        self._abandoned.set()
        self._model.interrupt(self)

    def check(self) -> None:
        if self.abandoned:
            raise Superseded(f"a newer save took over {self.path.name}")

    def infer(self, prompt: str, max_new_tokens: int) -> str:
        self.check()
        reply = self._model.infer(prompt, max_new_tokens, owner=self)
        # An interrupted generation stops mid-sentence, so the check comes before
        # anything tries to read the reply as an answer.
        self.check()
        return reply


class RepresentationBuildLifetimeManager:
    """Manages the lifetime of of builds, making sure to release the resources when the builds finish"""

    def __init__(self, model: Worker) -> None:
        self._model = model
        self._lock = threading.Lock()
        self._current: dict[Path, Build] = {}

    def start(self, path: Path) -> Build:
        current = Build(path, self._model)
        with self._lock:
            previous = self._current.get(path)
            self._current[path] = current

        # Outside the lock: abandoning reaches into the child process, and this
        # lock is only here to decide who is current.
        if previous is not None:
            _log.info("abandoning the build of %s, a newer save arrived", path.name)
            previous.abandon()
        return current

    def finish(self, build: Build) -> None:
        """Retire a build, unless a newer one has already taken the file over."""
        with self._lock:
            if self._current.get(build.path) is build:
                del self._current[build.path]
