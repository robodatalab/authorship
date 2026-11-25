from __future__ import annotations

import html
from abc import abstractmethod
from dataclasses import dataclass, field

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter

XHTML_DOC = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}" lang="{lang}">
<head>
  <meta charset="utf-8"/>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
{body}
</body>
</html>
"""

# A name with nothing under it: a part divider, or a chapter whose prose has not
# been written yet. The reader turns to a page holding one line, and it is set in
# the middle of that page rather than at the top of it.
ALONE_ON_THE_PAGE = "alone-on-the-page"


def xhtml_page(lang: str, title: str, body: str) -> str:
    return XHTML_DOC.format(lang=lang, title=html.escape(title), body=body)


@dataclass
class EpubPage(EpubItem):
    id: str
    metadata: EpubMetadata
    filename: str = field(init=False)

    def __post_init__(self) -> None:
        self.filename = f"{self.id}.xhtml"

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def body_xhtml(self) -> str: ...

    def export(self, epub_writer: EpubWriter) -> None:
        page_title = self.name or self.metadata.title
        page_xhtml = xhtml_page(self.metadata.language, page_title, self.body_xhtml)
        epub_writer.write_file(f"OEBPS/{self.filename}", page_xhtml)
        epub_writer.add_manifest_item(self.id, self.filename, "application/xhtml+xml")
        epub_writer.add_spine_item(self.id)
