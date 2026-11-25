from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import ALONE_ON_THE_PAGE, EpubPage
from server.publishing.markdown_to_xhtml_converter import SECTION_TITLE, _inline, blocks_to_xhtml


@dataclass
class EpubChapter(EpubPage):
    idx: int
    title: str
    body_lines: list[str]

    @classmethod
    def create(cls, idx: int, title: str, metadata: EpubMetadata) -> EpubChapter:
        chapter = cls(f"chap_{idx:03d}", metadata, idx, title, [])
        return chapter

    @property
    def name(self) -> str:
        return self.title or f"Chapter {self.idx + 1}"

    @property
    def body_xhtml(self) -> str:
        # A chapter cell carries the name and no prose of its own, so the heading
        # is put back onto the page here.
        name = f"<h{SECTION_TITLE}>{_inline(self.name)}</h{SECTION_TITLE}>"
        written = blocks_to_xhtml(self.body_lines)
        if not written:
            return f'<div class="{ALONE_ON_THE_PAGE}">\n{name}\n</div>'
        return f'<div class="chapter">\n{name}\n{written}\n</div>'
