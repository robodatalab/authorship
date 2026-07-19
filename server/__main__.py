import argparse
import threading

import uvicorn

from .api import Engine, app


def main() -> None:
    parser = argparse.ArgumentParser(prog="server")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    def start_engine() -> None:
        app.state.engine = Engine.start()

    threading.Thread(target=start_engine, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
