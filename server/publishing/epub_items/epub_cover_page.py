from __future__ import annotations

import html
from dataclasses import dataclass

from server.publishing.epub_items.epub_image import EpubImage
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import EpubPage


@dataclass
class EpubCoverPage(EpubPage):
    image: EpubImage

    @classmethod
    def create(cls, image: EpubImage, metadata: EpubMetadata) -> EpubCoverPage:
        cover_page = cls("cover", metadata, image)
        return cover_page

    @property
    def name(self) -> str:
        return self.metadata.title

    @property
    def body_xhtml(self) -> str:
        alt_text = html.escape(self.metadata.title, quote=True)
        return f'<div class="cover"><img src="{self.image.href}" alt="{alt_text}"/></div>'
