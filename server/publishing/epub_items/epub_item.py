from __future__ import annotations

from abc import ABC, abstractmethod

from server.publishing import tools


class EpubItem(ABC):
    @abstractmethod
    def export(self, epub_writer: tools.EpubWriter) -> None: ...
