"""Entry point.

Binds a port, announces it on stdout so the extension can find it, loads the
model in the background, and serves. Loading happens after the port is up so
`/health` can report `loading` rather than the caller seeing a dead socket for
the minute or two the weights take.
"""

import argparse
import socket
import threading

import uvicorn

from .api import app, engine
from .engine import DEFAULT_MODEL


def main() -> None:
    parser = argparse.ArgumentParser(prog="authorship-model")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--port", type=int, default=0, help="0 picks a free port")
    args = parser.parse_args()

    engine.model_id = args.model

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", args.port))
    print(f"AUTHORSHIP_PORT={sock.getsockname()[1]}", flush=True)

    threading.Thread(target=engine.load, daemon=True).start()

    uvicorn.run(app, fd=sock.fileno(), log_level="info")


if __name__ == "__main__":
    main()
