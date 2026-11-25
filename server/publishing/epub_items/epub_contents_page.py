from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.listing import Listing, links_in_the_listing
from server.publishing.epub_writer import EpubWriter
from server.publishing.markdown_to_xhtml_converter import _inline

CONTENTS_TITLE = "Contents"


@dataclass
class EpubContentsPage(EpubItem):
    id: str
    table_of_contents: list[Listing]
    language: str

    @classmethod
    def create(cls, metadata: EpubMetadata) -> EpubContentsPage:
        contents_page = cls("contents", [], metadata.language)
        return contents_page

    def export(self, epub_writer: EpubWriter) -> None:
        items = links_in_the_listing(self.table_of_contents, "    ", _inline)
        body_xhtml = (
            '<div class="contents">\n  <h1>Contents</h1>\n  <ol>\n'
            f"{items}\n  </ol>\n</div>"
        )
        epub_writer.write_page(self.id, CONTENTS_TITLE, self.language, body_xhtml)
