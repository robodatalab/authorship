from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import EpubPage
from server.publishing.epub_items.listing import Listing, links_in_the_listing
from server.publishing.markdown_to_xhtml_converter import _inline


@dataclass
class EpubContentsPage(EpubPage):
    table_of_contents: list[Listing]

    @classmethod
    def create(cls, metadata: EpubMetadata) -> EpubContentsPage:
        contents_page = cls("contents", metadata, [])
        return contents_page

    @property
    def name(self) -> str:
        return "Contents"

    @property
    def body_xhtml(self) -> str:
        items = links_in_the_listing(self.table_of_contents, "    ", _inline)
        return (
            '<div class="contents">\n  <h1>Contents</h1>\n  <ol>\n'
            f"{items}\n  </ol>\n</div>"
        )
