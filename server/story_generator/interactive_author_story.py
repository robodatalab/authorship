"""An interactive story, kept in an `.author` document: everything the benchmark
and the story generator read from the document, or write into it, beyond its
storydoc format.

Every plot event has a timestamp and a place: the timestamp is a clock shared by
all the plots, and the place is a place cell, nested in the places around it and
written from the broadest place to the most specific, as in "earth, Varn's house". Events at the same moment and in the
same place form one scene.

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
from functools import cached_property

from authordoc.cells.character_cell import CharacterCell
from authordoc.cells.markdown_cell import MarkdownCell
from authordoc.cells.place_cell import PlaceCell
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

# Parts the moment, the place, the characters and what happens of an event written
# out for the model.
SEPARATOR = " | "

PLACE_SEPARATOR = ", "


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
        first_word = event.story_word_range.first_word
        cell_id = self._cell_id_of_story_word.get(first_word)
        if cell_id is None:
            return None
        cell = self.document.cell_with_id(cell_id)
        if not isinstance(cell, MarkdownCell):
            return None
        scene = InteractiveScene(cell)
        return scene

    @cached_property
    def _cell_id_of_story_word(self) -> dict[int, str]:
        story_words = StoryWordsIterator(self.document)
        cell_ids = {word.number: word.cell_id for word in story_words}
        return cell_ids

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
        """The event as its moment, place, characters and what happens."""
        place_name = self.place_name_of(event)
        names = self.names_of_the_characters_in(event)
        line = SEPARATOR.join((event.timestamp, place_name, names, event.summary))
        return line

    def place_name_of(self, event: PlotNode) -> str:
        place = event.place(self.document)
        titles_inwards: list[str] = []
        places_seen: set[str] = set()
        while place is not None and place.unique_id not in places_seen:
            titles_inwards.insert(0, place.title)
            places_seen.add(place.unique_id)
            place = place.parent(self.document)
        place_name = PLACE_SEPARATOR.join(titles_inwards)
        return place_name

    def with_place_named(self, name: str) -> tuple[InteractiveAuthorStory, PlaceCell]:
        titles = [title.strip() for title in name.split(",") if title.strip()] or [name]
        story = self
        place: PlaceCell | None = None
        for title in titles:
            story, place = story._with_place_within(title, place)
        assert place is not None
        return story, place

    def _with_place_within(self, title: str, around: PlaceCell | None) -> tuple[InteractiveAuthorStory, PlaceCell]:
        around_id = None if around is None else around.unique_id
        places = [cell for cell in self.document.cells if isinstance(cell, PlaceCell)]
        named = next(
            (
                place
                for place in places
                if place.title.casefold() == title.casefold() and _id_of_the_place_around(place, self.document) == around_id
            ),
            None,
        )
        if named is not None:
            return self, named
        unplaced = PlaceCell(title)
        place = unplaced.with_parent(around)
        document = self.document.with_cells([*self.document.cells, place])
        story = InteractiveAuthorStory(document)
        return story, place

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
        concepts = self.document.salient_concepts()
        written = written_under_their_titles(concepts)
        return written

    def character_named(self, name: str) -> CharacterCell | None:
        characters = [cell for cell in self.document.cells if isinstance(cell, CharacterCell)]
        named = next((character for character in characters if character.title == name), None)
        return named

    def with_character(self, character: CharacterCell) -> InteractiveAuthorStory:
        document = self.document.with_cells([*self.document.cells, character])
        story = InteractiveAuthorStory(document)
        return story

    def names_of_the_characters_in(self, event: PlotNode) -> str:
        characters = event.characters(self.document)
        names = ", ".join(character.title for character in characters)
        return names


def _id_of_the_place_around(place: PlaceCell, document: Document) -> str | None:
    around = place.parent(document)
    around_id = None if around is None else around.unique_id
    return around_id


def written_under_their_titles(cells: Sequence[SalientConceptCell | CharacterCell]) -> str:
    described = [f"### {cell.title}\n{cell.source}" for cell in cells]
    written = "\n\n".join(described) or "None yet."
    return written
