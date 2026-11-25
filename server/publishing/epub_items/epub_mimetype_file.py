from __future__ import annotations

import zipfile

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing import tools


class EpubMimetypeFile(EpubItem):
    def export(self, epub_writer: tools.EpubWriter) -> None:
        # mimetype MUST be first and stored uncompressed.
        epub_writer.write_file("mimetype", "application/epub+zip", zipfile.ZIP_STORED)
