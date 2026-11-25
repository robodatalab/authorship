from __future__ import annotations

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing import tools

CONTAINER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""


class EpubContainerFile(EpubItem):
    def export(self, epub_writer: tools.EpubWriter) -> None:
        epub_writer.write_file("META-INF/container.xml", CONTAINER_XML)
