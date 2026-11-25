from __future__ import annotations

from server.publishing.epub_items.epub_image import EpubImage
from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter


class EpubImagePage(EpubItem):
    def __init__(self, id: str, image_href: str, book_title: str, language: str) -> None:
        self.id = id
        self.image_href = image_href
        self.book_title = book_title
        self.language = language

    @classmethod
    def create(cls, image: EpubImage, metadata: EpubMetadata) -> EpubImagePage:
        image_page = cls(f"{image.id}_page", image.href, metadata.title, metadata.language)
        return image_page

    def export(self, epub_writer: EpubWriter) -> None:
        body_xhtml = f'<div class="image-page"><img src="{self.image_href}" alt=""/></div>'
        epub_writer.write_page(self.id, self.book_title, self.language, body_xhtml)
