from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import EpubPage
from server.publishing.markdown_to_xhtml_converter import _inline


@dataclass
class EpubTitlePage(EpubPage):
    @classmethod
    def create(cls, metadata: EpubMetadata) -> EpubTitlePage:
        title_page = cls("titlepage", metadata)
        return title_page

    @property
    def name(self) -> str:
        return self.metadata.title

    @property
    def body_xhtml(self) -> str:
        title_page_lines = [f'  <h1 class="book-title">{_inline(self.metadata.title)}</h1>']
        if self.metadata.subtitle:
            title_page_lines.append(f'  <p class="subtitle">{_inline(self.metadata.subtitle)}</p>')
        if self.metadata.author:
            title_page_lines.append(f'  <p class="author">{_inline(self.metadata.author)}</p>')
        if self.metadata.publisher:
            title_page_lines.append(f'  <p class="publisher">{_inline(self.metadata.publisher)}</p>')
        joined_lines = "\n".join(title_page_lines)
        return f'<div class="title-page">\n{joined_lines}\n</div>'
