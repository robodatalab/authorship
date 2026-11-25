from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from server.publishing.epub_items.epub_page import EpubPage


@dataclass
class Listing:
    item: EpubPage
    within: list[Listing]


def links_in_the_listing(
    listing: list[Listing], indent: str, named: Callable[[str], str]
) -> str:
    lines = []
    for entry in listing:
        link = (
            f'{indent}<li><a href="{entry.item.filename}">'
            f"{named(entry.item.name)}</a>"
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
