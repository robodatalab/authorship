from __future__ import annotations

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing import tools

# Prose the author left standing outside every chapter — a dedication, an
# epigraph, a note to the reader. Printed where it stands rather than swallowed
# by a chapter it was never part of.
LOOSE = "page_"


class EpubProsePage(EpubItem):
    def __init__(self, id: str, lines: list[str], book_title: str, language: str) -> None:
        self.id = id
        self.lines = lines
        self.book_title = book_title
        self.language = language

    @classmethod
    def create(cls, number: int, lines: list[str], metadata: EpubMetadata) -> EpubProsePage:
        prose_page = cls(f"{LOOSE}{number:03d}", lines, metadata.title, metadata.language)
        return prose_page

    def export(self, epub_writer: EpubWriter) -> None:
        written = tools.blocks_to_xhtml(self.lines)
        body_xhtml = f'<div class="chapter">\n{written}\n</div>'
        epub_writer.write_page(self.id, self.book_title, self.language, body_xhtml)
