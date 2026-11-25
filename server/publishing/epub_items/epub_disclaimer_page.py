from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import EpubPage
from server.publishing.markdown_to_xhtml_converter import SECTION_TITLE, _inline, blocks_to_xhtml


@dataclass
class EpubDisclaimerPage(EpubPage):
    """The page the reader turns past on the way in, headed by its own name."""

    title: str
    source: str

    @classmethod
    def create(cls, title: str, source: str, metadata: EpubMetadata) -> EpubDisclaimerPage:
        disclaimer_page = cls("disclaimer", metadata, title, source)
        return disclaimer_page

    @property
    def name(self) -> str:
        return self.title or "Disclaimer"

    @property
    def body_xhtml(self) -> str:
        heading = _inline(self.name)
        source_lines = self.source.splitlines()
        body = blocks_to_xhtml(source_lines)
        return (
            f'<div class="disclaimer">\n'
            f"<h{SECTION_TITLE}>{heading}</h{SECTION_TITLE}>\n{body}\n</div>"
        )
