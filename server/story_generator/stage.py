from __future__ import annotations

import abc

from authordoc.storydoc import Document


class StageStep(abc.ABC):

    @abc.abstractmethod
    async def __call__(self, document: Document) -> Document:
        pass


class Stage(abc.ABC):

    @abc.abstractmethod
    def run(self, document: Document) -> list[StageStep]:
        pass
