from __future__ import annotations

import html
from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing.epub_items.listing import Listing


def nav_points(
    listing: list[Listing], indent: str, played: int
) -> tuple[list[str], int]:
    points: list[str] = []
    for entry in listing:
        played += 1
        at = played
        held: list[str] = []
        if entry.within:
            held, played = nav_points(entry.within, indent + "  ", played)
        points.append(
            f'{indent}<navPoint id="np{at}" playOrder="{at}">\n'
            f"{indent}  <navLabel><text>{html.escape(entry.item.name)}</text>"
            f"</navLabel>\n"
            f'{indent}  <content src="{entry.item.filename}"/>\n'
            + ("\n".join(held) + "\n" if held else "")
            + f"{indent}</navPoint>"
        )
    return points, played


def how_deep_the_listing_goes(listing: list[Listing]) -> int:
    return max(
        (1 + how_deep_the_listing_goes(entry.within) for entry in listing),
        default=0,
    )


@dataclass
class EpubNcx(EpubItem):
    metadata: EpubMetadata
    table_of_contents: list[Listing]

    def export(self, epub_writer: EpubWriter) -> None:
        points, _ = nav_points(self.table_of_contents, "    ", 0)
        depth = max(1, how_deep_the_listing_goes(self.table_of_contents))
        title = html.escape(self.metadata.title)
        nav_map = "\n".join(points)
        ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{self.metadata.book_id}"/>
    <meta name="dtb:depth" content="{depth}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{title}</text></docTitle>
  <navMap>
{nav_map}
  </navMap>
</ncx>
"""
        epub_writer.write_file("OEBPS/toc.ncx", ncx)
        epub_writer.add_manifest_item("ncx", "toc.ncx", "application/x-dtbncx+xml")
