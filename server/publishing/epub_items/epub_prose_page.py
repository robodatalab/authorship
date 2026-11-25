from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import EpubPage
from server.publishing.markdown_to_xhtml_converter import blocks_to_xhtml

# Prose the author left standing outside every chapter — a dedication, an
# epigraph, a note to the reader. Printed where it stands rather than swallowed
# by a chapter it was never part of.
LOOSE = "page_"


@dataclass
class EpubProsePage(EpubPage):
    lines: list[str]

    @classmethod
    def create(cls, number: int, lines: list[str], metadata: EpubMetadata) -> EpubProsePage:
        prose_page = cls(f"{LOOSE}{number:03d}", metadata, lines)
        return prose_page

    @property
    def name(self) -> str:
        return ""

    @property
    def body_xhtml(self) -> str:
        written = blocks_to_xhtml(self.lines)
        return f'<div class="chapter">\n{written}\n</div>'
