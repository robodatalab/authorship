from __future__ import annotations

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_stylesheet import ALONE_ON_THE_PAGE
from server.publishing import tools


class EpubPartPage(EpubItem):
    def __init__(self, id: str, idx: int, title: str, language: str) -> None:
        self.id = id
        self.idx = idx
        self.title = title
        self.language = language

    @classmethod
    def create(cls, idx: int, title: str, metadata: EpubMetadata) -> EpubPartPage:
        part_page = cls("part", idx, title, metadata.language)
        return part_page

    @property
    def name(self) -> str:
        return self.title or f"Part {self.idx + 1}"

    @property
    def filename(self) -> str:
        return tools.page_filename(self.id)

    def export(self, epub_writer: tools.EpubWriter) -> None:
        part_name = tools.inline_to_xhtml(self.name)
        body_xhtml = f'<div class="{ALONE_ON_THE_PAGE}">\n<h1>{part_name}</h1>\n</div>'
        epub_writer.write_page(self.id, self.name, self.language, body_xhtml)
