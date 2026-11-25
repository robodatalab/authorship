from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing.markdown_to_xhtml_converter import SECTION_TITLE, _inline, blocks_to_xhtml


@dataclass
class EpubDisclaimerPage(EpubItem):

    id: str
    title: str
    source: str
    language: str

    @classmethod
    def create(cls, title: str, source: str, metadata: EpubMetadata) -> EpubDisclaimerPage:
        disclaimer_page = cls("disclaimer", title, source, metadata.language)
        return disclaimer_page

    def export(self, epub_writer: EpubWriter) -> None:
        name = self.title or "Disclaimer"
        heading = _inline(name)
        source_lines = self.source.splitlines()
        body = blocks_to_xhtml(source_lines)
        body_xhtml = (
            f'<div class="disclaimer">\n'
            f"<h{SECTION_TITLE}>{heading}</h{SECTION_TITLE}>\n{body}\n</div>"
        )
        epub_writer.write_page(self.id, name, self.language, body_xhtml)
