from __future__ import annotations

from abc import ABC, abstractmethod

from server.publishing.epub_writer import EpubWriter


class EpubItem(ABC):
    @abstractmethod
    def export(self, epub_writer: EpubWriter) -> None: ...
