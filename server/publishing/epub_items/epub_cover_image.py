from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_image import EpubImage
from server.publishing.epub_writer import EpubWriter


@dataclass
class EpubCoverImage(EpubImage):
    def export(self, epub_writer: EpubWriter) -> None:
        image_bytes = self.source.read_bytes()
        epub_writer.write_file(f"OEBPS/{self.href}", image_bytes)
        epub_writer.add_manifest_item("cover-image", self.href, self.media, "cover-image")
        epub_writer.add_metadata_element('<meta name="cover" content="cover-image"/>')
