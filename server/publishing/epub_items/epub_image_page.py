from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_image import EpubImage
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import EpubPage


@dataclass
class EpubImagePage(EpubPage):
    image: EpubImage

    @classmethod
    def create(cls, image: EpubImage, metadata: EpubMetadata) -> EpubImagePage:
        image_page = cls(f"{image.id}_page", metadata, image)
        return image_page

    @property
    def name(self) -> str:
        return ""

    @property
    def body_xhtml(self) -> str:
        return f'<div class="image-page"><img src="{self.image.href}" alt=""/></div>'
