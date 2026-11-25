from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import ALONE_ON_THE_PAGE, EpubPage
from server.publishing.markdown_to_xhtml_converter import _inline


@dataclass
class EpubPartPage(EpubPage):
    """The divider a reader turns to before the chapters under it.

    A page of its own carrying one line: every document in the spine opens a
    page, so the name stands alone with nothing above or below it.
    """

    idx: int
    title: str

    @classmethod
    def create(cls, idx: int, title: str, metadata: EpubMetadata) -> EpubPartPage:
        part_page = cls("part", metadata, idx, title)
        return part_page

    @property
    def name(self) -> str:
        return self.title or f"Part {self.idx + 1}"

    @property
    def body_xhtml(self) -> str:
        part_name = _inline(self.name)
        return f'<div class="{ALONE_ON_THE_PAGE}">\n<h1>{part_name}</h1>\n</div>'
