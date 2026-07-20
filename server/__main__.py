import argparse

import uvicorn

from . import log
from .api import app


def main() -> None:
    parser = argparse.ArgumentParser(prog="server")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    log.setup()
    log.dump_stacks_on_signal()
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
