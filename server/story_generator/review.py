from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class Shown(Protocol):

    def written(self) -> dict[str, Any]:
        """As the editor reads it."""


@dataclass(frozen=True)
class CellsShown:
    cell_kind: str

    def written(self) -> dict[str, Any]:
        return {"kind": "cells", "cellKind": self.cell_kind}


@dataclass(frozen=True)
class CommandShown:
    cell_kind: str
    command_name: str

    def written(self) -> dict[str, Any]:
        return {"kind": "command", "cellKind": self.cell_kind, "commandName": self.command_name}


@dataclass(frozen=True)
class EditorShown:
    def written(self) -> dict[str, Any]:
        return {"kind": "editor"}


@dataclass(frozen=True)
class Asked:
    stage: str
    story: str
    shown: Shown

    def written(self) -> dict[str, Any]:
        return {"stage": self.stage, "story": self.story, "shown": self.shown.written()}
