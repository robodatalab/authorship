import json
from pathlib import Path
import re
from typing import Any


def graph_path_for(document: Path) -> Path:
    """`story.md` sits next to `story.graph.yaml` — by convention, not
    configuration. Mirrors `graphPathFor` in extension/story_graph/model.ts."""
    stem = re.sub(r"\.md$", "", document.name, flags=re.I)
    return document.with_name(stem + ".graph.yaml")


def numbered(story_markdown: str) -> str:
    """Prefix every line with its 0-based index."""
    return "\n".join(
        f"{index} | {line}" for index, line in enumerate(story_markdown.splitlines())
    )


def json_object(reply: str) -> dict[str, Any]:
    """Take the first JSON object out of a completion.

    The reply is prose as far as the server is concerned — it may arrive fenced,
    prefaced, or trailed by commentary. Scanning for a balanced object survives
    all three. Raises `ValueError` if there is nothing usable, which fails the
    request and leaves the existing graph file alone.
    """
    start = reply.find("{")
    if start < 0:
        raise ValueError("no JSON object in the model's reply")

    depth = 0
    in_string = False
    escaped = False

    for position in range(start, len(reply)):
        character = reply[position]

        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue

        if character == '"':
            in_string = True
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                parsed = json.loads(reply[start : position + 1])
                if not isinstance(parsed, dict):
                    raise ValueError("the model's reply was not a JSON object")
                return parsed

    raise ValueError("the model's reply ended mid-object")
