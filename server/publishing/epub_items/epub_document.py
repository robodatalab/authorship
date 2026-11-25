from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_writer import EpubWriter


@dataclass
class EpubDocument(EpubItem):
    items: list[EpubItem]

    def export(self, epub_writer: EpubWriter) -> None:
        for item in self.items:
            item.export(epub_writer)
