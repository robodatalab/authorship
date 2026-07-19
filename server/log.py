"""Logging setup, called once per process.

The worker is spawned, not forked, so it inherits no handlers and has to
configure its own. Both processes write to stdout, which is the terminal the
launch configuration opens.
"""

import logging
import sys

FORMAT = "%(asctime)s %(name)-12s %(message)s"
TIME_FORMAT = "%H:%M:%S"


def setup() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(FORMAT, datefmt=TIME_FORMAT))

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    # uvicorn installs its own handlers on its own loggers; adding a second
    # root handler here would print every request line twice.
    if not any(isinstance(existing, logging.StreamHandler) for existing in root.handlers):
        root.addHandler(handler)


def logger(name: str) -> logging.Logger:
    """Short names: the format column is 12 wide, and `server.worker` fills it."""
    return logging.getLogger(name.rsplit(".", 1)[-1])
