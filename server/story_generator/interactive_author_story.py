"""An interactive story, kept in an `.author` document: everything the benchmark
and the story generator read from the document, or write into it, beyond its
storydoc format.

Every plot event has a timestamp and a location: the timestamp is a clock shared
by all the plots, and the location runs from the broadest place to the most
specific, as in "earth, Varn's house". Events at the same moment and in the same
place form one scene.

Every scene is told by a markdown cell, which every event of the scene points at.
A scene that the story goes on from ends with the opening of a sentence, left
unfinished, and the choices that finish it, one for each edge leaving the scene's
events, written as a list that names the edge each choice follows:

    Varn's fingers tapped against her knee, _____

    <ol title="choices">
    <li edge="x1">as her phone rang with a call from mission control.</li>
    <li edge="x2">as she watched the gripper close on the object.</li>
    </ol>

A plot references the salient concepts it illustrates.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.plot_cell import PlotCell, PlotNode
from authordoc.cells.salient_concept_cell import SalientConceptCell
from authordoc.iterators.story_words_iterator import StoryWordsIterator
from authordoc.storydoc import Document
from authordoc.written_attributes import attributes_in, written_attribute_value

# Marks the gap the choices fill, at the end of the sentence a scene leaves unfinished.
GAP = "_____"

_ATTRIBUTES = r'((?:\s+[A-Za-z0-9][A-Za-z0-9_-]*\s*=\s*"(?:[^"\\]|\\.)*")*)\s*'
_CHOICES_OPENED = '<ol title="choices">'
_CHOICE = re.compile(rf"^<li{_ATTRIBUTES}>(.*)</li>$")
_CHOICES_CLOSED = "</ol>"
_EDGE = "edge"

# Parts the moment, the place and what happens of an event written out for the model.
SEPARATOR = " | "


class InteractiveScene:
    """A scene, told by a markdown cell: its text, then the opening of a sentence it
    leaves unfinished at the gap, then the options that finish it, each by the id
    of the edge it follows. A scene the story ends at has neither."""

    def __init__(self, markdown_cell: MarkdownCell) -> None:
        self.markdown_cell = markdown_cell

    @property
    def markdown_cell_id(self) -> str:
        return self.markdown_cell.unique_id

    @property
    def text(self) -> str:
        scene_text, _, _ = self._read()
        return scene_text

    def with_text(self, scene_text: str) -> InteractiveScene:
        _, opening, options = self._read()
        scene = self._written(scene_text, opening, options)
        return scene

    @property
    def opening(self) -> str:
        """The opening of the sentence the scene leaves unfinished; empty for a
        scene that leaves none."""
        _, opening, _ = self._read()
        return opening

    def with_opening(self, opening: str) -> InteractiveScene:
        scene_text, _, options = self._read()
        scene = self._written(scene_text, opening, options)
        return scene

    @property
    def options(self) -> dict[str, str]:
        """The options that finish the sentence, each by the id of the edge it
        follows, in the order the scene lists them."""
        _, _, options = self._read()
        return options

    def with_options(self, options: dict[str, str]) -> InteractiveScene:
        scene_text, opening, _ = self._read()
        scene = self._written(scene_text, opening, options)
        return scene

    def _read(self) -> tuple[str, str, dict[str, str]]:
        """The cell's source parsed: the scene's text, its opening and its options."""
        told_to_the_gap, _, written_options = self.markdown_cell.source.partition(_CHOICES_OPENED)
        told = told_to_the_gap.strip()
        scene_text = told
        opening = ""
        if told.endswith(GAP):
            scene_text, _, unfinished = told.rpartition("\n\n")
            without_the_gap = unfinished.removesuffix(GAP)
            opening = without_the_gap.strip()
        options: dict[str, str] = {}
        for line in written_options.splitlines():
            written_option = _CHOICE.match(line)
            if written_option is None:
                continue
            written_attributes = written_option.group(1)
            attributes = attributes_in(written_attributes)
            edge_id = attributes[_EDGE]
            option = written_option.group(2)
            options[edge_id] = option
        return (scene_text, opening, options)

    def _written(self, scene_text: str, opening: str, options: dict[str, str]) -> InteractiveScene:
        """The scene with its cell's source written from its text, opening and
        options, as the schema writes them; what it lacks is left out."""
        parts = [scene_text] if scene_text else []
        if opening:
            parts.append(f"{opening} {GAP}")
        if options:
            written_options = [_CHOICES_OPENED]
            for edge_id, option in options.items():
                written_edge = written_attribute_value(edge_id)
                written_options.append(f'<li {_EDGE}="{written_edge}">{option}</li>')
            written_options.append(_CHOICES_CLOSED)
            options_list = "\n".join(written_options)
            parts.append(options_list)
        source = "\n\n".join(parts)
        cell = self.markdown_cell.with_source(source)
        scene = InteractiveScene(cell)
        return scene


class InteractiveAuthorStory:
    """An interactive story, kept in `document`."""

    def __init__(self, document: Document) -> None:
        self.document = document

    @property
    def scenes(self) -> list[InteractiveScene]:
        """Every markdown cell that tells an event, as a scene, in the order of the
        cells; a markdown cell no event points at tells no scene."""
        told = [self.scene_of(event) for plot in self.document.plots() for event in plot.nodes]
        telling = {scene.markdown_cell_id for scene in told if scene is not None}
        scenes = [
            InteractiveScene(cell)
            for cell in self.document.cells
            if isinstance(cell, MarkdownCell) and cell.unique_id in telling
        ]
        return scenes

    def with_scenes(self, scenes: Sequence[InteractiveScene]) -> InteractiveAuthorStory:
        """The story with these scenes in it: a scene whose cell the story has takes
        that cell's place, and one it does not have comes after its last cell."""
        cell_of_id = {scene.markdown_cell_id: scene.markdown_cell for scene in scenes}
        ids_held = {cell.unique_id for cell in self.document.cells}
        cells = [cell_of_id.get(cell.unique_id, cell) for cell in self.document.cells]
        added = [scene.markdown_cell for scene in scenes if scene.markdown_cell_id not in ids_held]
        document = self.document.with_cells([*cells, *added])
        story = InteractiveAuthorStory(document)
        return story

    def scene_of(self, event: PlotNode) -> InteractiveScene | None:
        """The scene that tells the event: the one whose cell holds the event's
        first word; None for an event no scene tells."""
        if event.story_word_range is None:
            return None
        story_words = StoryWordsIterator(self.document)
        spans = story_words.spans(event.story_word_range)
        if not spans:
            return None
        first_span, *_ = spans
        cell = self.document.cell_with_id(first_span.cell_id)
        if not isinstance(cell, MarkdownCell):
            return None
        scene = InteractiveScene(cell)
        return scene

    def events_of(self, scene: InteractiveScene) -> list[PlotNode]:
        """The events the scene tells: every event whose scene it is, in the order of
        the plots."""
        told = [(event, self.scene_of(event)) for plot in self.document.plots() for event in plot.nodes]
        events = [event for event, told_in in told if told_in is not None and told_in.markdown_cell_id == scene.markdown_cell_id]
        return events

    def written_world_events(self, but: str) -> str:
        """Every plot's events, each plot under its title, one event a line as its
        moment, place and what happens, but those of the plot titled `but`."""
        tables = []
        for plot in self.document.plots():
            if plot.title == but:
                continue
            table = self.written_events(plot)
            tables.append(f"### {plot.title}\n{table}")
        written = "\n\n".join(tables) or "None yet."
        return written

    def written_events(self, plot: PlotCell) -> str:
        """The plot's events, one a line."""
        lines = [self.written_event(event) for event in plot.nodes]
        table = "\n".join(lines)
        return table

    def written_event(self, event: PlotNode) -> str:
        """The event as its moment, place and what happens."""
        line = SEPARATOR.join((event.timestamp, event.location, event.summary))
        return line

    def plots_of(self, concept: SalientConceptCell) -> list[PlotCell]:
        """The plots that reference the concept, in the order of the plots."""
        plots = []
        for plot in self.document.plots():
            shown = plot.concepts(self.document)
            shown_ids = [shown_concept.unique_id for shown_concept in shown]
            if concept.unique_id in shown_ids:
                plots.append(plot)
        return plots

    def written_concepts(self) -> str:
        """Every concept, each under its title, with its description."""
        described = [f"### {concept.title}\n{concept.source}" for concept in self.document.salient_concepts()]
        written = "\n\n".join(described) or "None yet."
        return written
