from __future__ import annotations

from server.storydoc.cells.about_cell import AboutCell
from server.storydoc.cells.blurb_cell import BlurbCell
from server.storydoc.cells.cell_visitor import CellVisitor
from server.storydoc.cells.chapter_cell import ChapterCell
from server.storydoc.cells.disclaimer_cell import DisclaimerCell
from server.storydoc.cells.divider_cell import DividerCell
from server.storydoc.cells.image_cell import ImageCell
from server.storydoc.cells.markdown_cell import MarkdownCell
from server.storydoc.cells.note_cell import NoteCell
from server.storydoc.cells.part_cell import PartCell
from server.storydoc.cells.plot_cell import PlotCell
from server.storydoc.cells.plot_edge import PlotEdge
from server.storydoc.cells.plot_node import PlotNode
from server.storydoc.cells.recap_cell import RecapCell
from server.storydoc.cells.salient_concept_cell import SalientConceptCell
from server.storydoc.cells.story_word_range import StoryWordRange
from server.storydoc.cells.table_of_contents_cell import TableOfContentsCell
from server.storydoc.cells.title_page_cell import TitlePageCell
from server.storydoc.cells.unknown_cell import UnknownCell

# What an attribute says when the answer to it is no.
NO = "no"

FULL_PAGE = "full-page"

UNIQUE_ID = "id"
FOLDED = "folded"
TRUE = "true"

TITLE = "title"
SUBTITLE = "subtitle"
AUTHOR = "author"
PUBLISHER = "publisher"
DATE = "date"
VERSION = "version"
ISBN = "isbn"
COVER_DESIGNER = "cover-designer"
LANGUAGE = "language"
SRC = "src"
KDP = "kdp"
WEBSITE = "website"
SUBSTACK = "substack"
PORTRAIT = "portrait"
DOCUMENTS = "documents"

STORY_WORD_RANGES = "words"

PLOT_NODES = "nodes"
PLOT_EDGES = "edges"


def _without_the_ones_nothing_is_said_about(
    attributes: dict[str, str],
) -> dict[str, str]:
    return {name: value for name, value in attributes.items() if value != ""}


def _written_story_word_ranges(story_word_ranges: list[StoryWordRange]) -> str:
    return ", ".join(
        f"{story_word_range.first_word}-{story_word_range.last_word}"
        for story_word_range in story_word_ranges
    )


def _written_plot_nodes(nodes: list[PlotNode]) -> str:
    return ", ".join(
        f"{node.node_id}:{node.story_word_range.first_word}"
        f"-{node.story_word_range.last_word}"
        for node in nodes
    )


def _written_plot_edges(edges: list[PlotEdge]) -> str:
    return ", ".join(
        f"{edge.edge_id}:{edge.from_node_id}>{edge.to_node_id}" for edge in edges
    )


class MarkerAttributes(CellVisitor[dict[str, str]]):
    def visit_markdown(self, cell: MarkdownCell) -> dict[str, str]:
        return {}

    def visit_chapter(self, cell: ChapterCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({TITLE: cell.title})

    def visit_part(self, cell: PartCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({TITLE: cell.title})

    def visit_divider(self, cell: DividerCell) -> dict[str, str]:
        return {}

    def visit_title_page(self, cell: TitlePageCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about(
            {
                TITLE: cell.title,
                SUBTITLE: cell.subtitle,
                AUTHOR: cell.author,
                PUBLISHER: cell.publisher,
                DATE: cell.date,
                VERSION: cell.version,
                ISBN: cell.isbn,
                COVER_DESIGNER: cell.cover_designer,
                LANGUAGE: cell.language,
            }
        )

    def visit_image(self, cell: ImageCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about(
            {SRC: cell.src, FULL_PAGE: "" if cell.full_page else NO}
        )

    def visit_table_of_contents(self, cell: TableOfContentsCell) -> dict[str, str]:
        return {}

    def visit_disclaimer(self, cell: DisclaimerCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({TITLE: cell.title})

    def visit_about(self, cell: AboutCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about(
            {
                KDP: cell.kdp,
                WEBSITE: cell.website,
                SUBSTACK: cell.substack,
                PORTRAIT: cell.portrait,
            }
        )

    def visit_blurb(self, cell: BlurbCell) -> dict[str, str]:
        return {}

    def visit_note(self, cell: NoteCell) -> dict[str, str]:
        return {}

    def visit_recap(self, cell: RecapCell) -> dict[str, str]:
        return _without_the_ones_nothing_is_said_about({DOCUMENTS: cell.documents})

    def visit_salient_concept(self, cell: SalientConceptCell) -> dict[str, str]:
        story_word_ranges = _written_story_word_ranges(cell.story_word_ranges)
        return _without_the_ones_nothing_is_said_about(
            {TITLE: cell.title, STORY_WORD_RANGES: story_word_ranges}
        )

    def visit_plot(self, cell: PlotCell) -> dict[str, str]:
        nodes = _written_plot_nodes(cell.nodes)
        edges = _written_plot_edges(cell.edges)
        return _without_the_ones_nothing_is_said_about(
            {TITLE: cell.title, PLOT_NODES: nodes, PLOT_EDGES: edges}
        )

    def visit_unknown(self, cell: UnknownCell) -> dict[str, str]:
        return dict(cell.attrs)
