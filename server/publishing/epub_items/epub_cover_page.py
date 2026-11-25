from __future__ import annotations

import html

from server.publishing.epub_items.epub_image import EpubImage
from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter


class EpubCoverPage(EpubItem):
    def __init__(self, id: str, title: str, image_href: str, language: str) -> None:
        self.id = id
        self.title = title
        self.image_href = image_href
        self.language = language

    @classmethod
    def create(cls, image: EpubImage, metadata: EpubMetadata) -> EpubCoverPage:
        cover_page = cls("cover", metadata.title, image.href, metadata.language)
        return cover_page

    def export(self, epub_writer: EpubWriter) -> None:
        alt_text = html.escape(self.title, quote=True)
        body_xhtml = f'<div class="cover"><img src="{self.image_href}" alt="{alt_text}"/></div>'
        epub_writer.write_page(self.id, self.title, self.language, body_xhtml)
