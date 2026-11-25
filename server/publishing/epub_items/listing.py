from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass



@dataclass
class Listing:
    name: str
    filename: str
    within: list[Listing]


def links_in_the_listing(
    listing: list[Listing], indent: str, named: Callable[[str], str]
) -> str:
    lines = []
    for entry in listing:
        link = (
            f'{indent}<li><a href="{entry.filename}">'
            f"{named(entry.name)}</a>"
        )
        if not entry.within:
            lines.append(f"{link}</li>")
            continue
        lines.append(
            f"{link}\n{indent}  <ol>\n"
            f"{links_in_the_listing(entry.within, indent + '    ', named)}\n"
            f"{indent}  </ol>\n{indent}</li>"
        )
    return "\n".join(lines)
