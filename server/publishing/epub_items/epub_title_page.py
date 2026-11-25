from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing.markdown_to_xhtml_converter import _inline


@dataclass
class EpubTitlePage(EpubItem):
    id: str
    title: str
    subtitle: str
    author: str
    publisher: str
    language: str

    @classmethod
    def create(cls, metadata: EpubMetadata) -> EpubTitlePage:
        title_page = cls(
            "titlepage",
            metadata.title,
            metadata.subtitle,
            metadata.author,
            metadata.publisher,
            metadata.language,
        )
        return title_page

    def export(self, epub_writer: EpubWriter) -> None:
        title_page_lines = [f'  <h1 class="book-title">{_inline(self.title)}</h1>']
        if self.subtitle:
            title_page_lines.append(f'  <p class="subtitle">{_inline(self.subtitle)}</p>')
        if self.author:
            title_page_lines.append(f'  <p class="author">{_inline(self.author)}</p>')
        if self.publisher:
            title_page_lines.append(f'  <p class="publisher">{_inline(self.publisher)}</p>')
        joined_lines = "\n".join(title_page_lines)
        body_xhtml = f'<div class="title-page">\n{joined_lines}\n</div>'
        epub_writer.write_page(self.id, self.title, self.language, body_xhtml)
