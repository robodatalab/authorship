"""The author's review of every stage, at the editor: once a stage has done its
work, the story as it leaves it is shown to the author, with the part of
authorship the stage worked in brought into view. The author looks round it,
edits what they like, and answers from the editor's main menu: they accept the
story as they leave it, or reject it."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class Shown(Protocol):
    """The part of authorship brought into view for the author."""

    def written(self) -> dict[str, Any]:
        """As the editor reads it."""


@dataclass(frozen=True)
class CellsShown:
    """The cells of a kind, in the editor's metadata pane."""

    cell_kind: str

    def written(self) -> dict[str, Any]:
        return {"kind": "cells", "cellKind": self.cell_kind}


@dataclass(frozen=True)
class CommandShown:
    """The button of one of the editor's commands, for a kind of cell,
    highlighted in the metadata pane: what the author is to do there."""

    cell_kind: str
    command_name: str

    def written(self) -> dict[str, Any]:
        return {"kind": "command", "cellKind": self.cell_kind, "commandName": self.command_name}


@dataclass(frozen=True)
class EditorShown:
    """The story, in the editor."""

    def written(self) -> dict[str, Any]:
        return {"kind": "editor"}


@dataclass(frozen=True)
class Asked:
    """What the author is asked about `stage`: to review `story`, the story as the
    stage leaves it, with a part of authorship shown."""

    stage: str
    story: str
    shown: Shown

    def written(self) -> dict[str, Any]:
        return {"stage": self.stage, "story": self.story, "shown": self.shown.written()}
