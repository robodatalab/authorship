"""How a storydoc writes attributes, in a cell's marker and in a plot's events:
`name="value"` on one line, a backslash in the value escaping the character
after it, and `\\n` standing for a line break."""

from __future__ import annotations

import re

WRITTEN_ATTRIBUTE = re.compile(r'([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*"((?:[^"\\]|\\.)*)"')


def attributes_in(text: str) -> dict[str, str]:
    return {name: _unescaped(value) for name, value in WRITTEN_ATTRIBUTE.findall(text)}


def written_attribute_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _unescaped(value: str) -> str:
    return re.sub(
        r"\\(.)",
        lambda escape: "\n" if escape.group(1) == "n" else escape.group(1),
        value,
        flags=re.DOTALL,
    )
