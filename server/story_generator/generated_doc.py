"""A story being generated, saved with the checkpoint of where its generation
stands."""

from __future__ import annotations

from pathlib import Path

from authordoc.cells.unknown_cell import UnknownCell
from authordoc.storydoc import Document

# The kind of the cell the checkpoint is kept in.
CHECKPOINT = "GeneratedDocumentCheckpoint"

# Opens the lines of the checkpoint, as in "stage: mesh: True".
STAGE = "stage: "


class GeneratedDocument:
    """A story being generated: the story, kept in its .author file, and where its
    generation stands, kept in the checkpoint, a cell of its own last in the
    story, of a kind the format does not know and keeps as it is: which stages
    are finished."""

    def __init__(self, path: Path, stage_names: list[str]) -> None:
        self._path = path
        # The stages the story is generated in, in the order they run.
        self._stage_names = stage_names
        self.document = Document.load(self._path)
        self.stages: dict[str, bool] = {name: False for name in self._stage_names}

    def load(self) -> None:
        """Reads the story from its file, and where its generation stands from its
        checkpoint."""
        self.document = Document.load(self._path)
        checkpoint = self.document.get_cell(UnknownCell, CHECKPOINT)
        lines = checkpoint.source.splitlines() if checkpoint is not None else []

        self.stages = {name: False for name in self._stage_names}

        for line in lines:
            if line.startswith(STAGE):
                value = line.removeprefix(STAGE)
                stage, _, is_done = value.rpartition(": ")
                self.stages[stage] = is_done == "True"

    def save(self) -> None:
        """Writes the story into its file, with the checkpoint as its last cell: a
        stage may have added cells after the one it was kept in before."""
        lines = []

        for stage, is_done in self.stages.items():
            lines.append(f"{STAGE}{stage}: {is_done}")

        source = "\n".join(lines)

        held = self.document.get_cell(UnknownCell, CHECKPOINT)
        checkpoint = UnknownCell(CHECKPOINT, source=source) if held is None else held.with_source(source)
        others = [cell for cell in self.document.cells if cell.unique_id != checkpoint.unique_id]
        self.document = self.document.with_cells([*others, checkpoint])
        self.document.save()

    def next_stage(self) -> str | None:
        for stage_name in self._stage_names:
            if not self.stages[stage_name]:
                return stage_name
        return None

    def mark_stage_done(self, stage_name: str) -> None:
        self.stages[stage_name] = True
