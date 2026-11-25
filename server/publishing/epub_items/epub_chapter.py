from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_stylesheet import ALONE_ON_THE_PAGE
from server.publishing.epub_writer import EpubWriter, page_filename
from server.publishing.markdown_to_xhtml_converter import SECTION_TITLE, _inline, blocks_to_xhtml


@dataclass
class EpubChapter(EpubItem):
    id: str
    idx: int
    title: str
    body_lines: list[str]
    language: str

    @classmethod
    def create(cls, idx: int, title: str, metadata: EpubMetadata) -> EpubChapter:
        chapter = cls(f"chap_{idx:03d}", idx, title, [], metadata.language)
        return chapter

    @property
    def name(self) -> str:
        return self.title or f"Chapter {self.idx + 1}"

    @property
    def filename(self) -> str:
        return page_filename(self.id)

    def export(self, epub_writer: EpubWriter) -> None:
        # A chapter cell carries the name and no prose of its own, so the heading
        # is put back onto the page here.
        name = f"<h{SECTION_TITLE}>{_inline(self.name)}</h{SECTION_TITLE}>"
        written = blocks_to_xhtml(self.body_lines)
        if written:
            body_xhtml = f'<div class="chapter">\n{name}\n{written}\n</div>'
        else:
            body_xhtml = f'<div class="{ALONE_ON_THE_PAGE}">\n{name}\n</div>'
        epub_writer.write_page(self.id, self.name, self.language, body_xhtml)
