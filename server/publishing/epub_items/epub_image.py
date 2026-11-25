from __future__ import annotations

import mimetypes
from dataclasses import dataclass, field
from pathlib import Path

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_writer import EpubWriter


@dataclass
class EpubImage(EpubItem):
    id: str
    source: Path
    href: str = field(init=False)
    media: str = field(init=False)

    def __post_init__(self) -> None:
        self.href = f"{self.id}{self.source.suffix.lower() or '.jpg'}"
        self.media = mimetypes.guess_type(self.source.name)[0] or "image/jpeg"

    def export(self, epub_writer: EpubWriter) -> None:
        image_bytes = self.source.read_bytes()
        epub_writer.write_file(f"OEBPS/{self.href}", image_bytes)
        epub_writer.add_manifest_item(self.id, self.href, self.media)
