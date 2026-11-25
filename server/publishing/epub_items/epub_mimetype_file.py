from __future__ import annotations

import zipfile
from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_writer import EpubWriter


@dataclass
class EpubMimetypeFile(EpubItem):
    def export(self, epub_writer: EpubWriter) -> None:
        # mimetype MUST be first and stored uncompressed.
        epub_writer.write_file("mimetype", "application/epub+zip", zipfile.ZIP_STORED)
