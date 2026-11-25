from __future__ import annotations

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing import tools


class EpubDisclaimerPage(EpubItem):
    def __init__(self, id: str, title: str, source: str, language: str) -> None:
        self.id = id
        self.title = title
        self.source = source
        self.language = language

    @classmethod
    def create(cls, title: str, source: str, metadata: EpubMetadata) -> EpubDisclaimerPage:
        disclaimer_page = cls("disclaimer", title, source, metadata.language)
        return disclaimer_page

    def export(self, epub_writer: EpubWriter) -> None:
        name = self.title or "Disclaimer"
        heading = tools.inline_to_xhtml(name)
        source_lines = self.source.splitlines()
        body = tools.blocks_to_xhtml(source_lines)
        body_xhtml = (
            f'<div class="disclaimer">\n'
            f"<h{tools.SECTION_TITLE}>{heading}</h{tools.SECTION_TITLE}>\n{body}\n</div>"
        )
        epub_writer.write_page(self.id, name, self.language, body_xhtml)
