"""Logging setup, called once per process.

The worker is spawned, not forked, so it inherits no handlers and has to
configure its own. Both processes write to stdout, which is the terminal the
launch configuration opens — hence the pid column, which is the only thing
telling their lines apart.
"""

import faulthandler
import logging
import signal
import sys
from typing import Any

FORMAT = "%(asctime)s %(process)6d %(name)-12s %(message)s"
TIME_FORMAT = "%H:%M:%S"

#: Marks the handler as ours, so a second `setup()` is a no-op.
#:
#: The first version of this skipped setup whenever the root logger already had
#: a `StreamHandler`, which meant the worker silently got none: it imports
#: transformers and huggingface_hub before `run` is ever called, and they
#: install their own. The process most worth hearing from was the one that
#: could not speak.
MARK = "_authorship_handler"


def setup() -> None:
    root = logging.getLogger()
    if any(getattr(handler, MARK, False) for handler in root.handlers):
        return

    handler: Any = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(FORMAT, datefmt=TIME_FORMAT))
    setattr(handler, MARK, True)

    root.addHandler(handler)
    root.setLevel(logging.INFO)


def logger(name: str) -> logging.Logger:
    """Short names: the format column is 12 wide, and `server.worker` fills it."""
    return logging.getLogger(name.rsplit(".", 1)[-1])


def dump_stacks_on_signal() -> None:
    """Make the process able to say where it is stuck, on demand.

    Logging can only report from places we thought to instrument, which is never
    the place a hang turns out to be — the heartbeat can say the load has not
    moved in two minutes, but not what it is waiting on. `SIGUSR1` prints every
    thread's Python stack, including the frames inside torch and huggingface
    where the waiting actually happens.

    `faulthandler.enable` covers the other end: a segfault in a native library
    otherwise kills the process with nothing written at all.
    """
    faulthandler.enable()

    # Unix only, which is every platform this runs on, but the attribute check
    # keeps an import on Windows from failing outright.
    if hasattr(signal, "SIGUSR1"):
        faulthandler.register(signal.SIGUSR1, all_threads=True, chain=True)
