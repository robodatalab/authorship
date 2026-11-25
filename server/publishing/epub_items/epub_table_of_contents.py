from __future__ import annotations

import html
import uuid
from collections.abc import Callable
from dataclasses import dataclass

from authordoc import cells
from authordoc.story_sections import CellsInASection

from server.publishing.epub_items.epub_chapter import EpubChapter
from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_part_page import EpubPartPage
from server.publishing import tools

CONTENTS_PAGE_ID = "contents"
CONTENTS_TITLE = "Contents"


@dataclass
class TableOfContentsEntry:
    title: str
    filename: str
    children: list[TableOfContentsEntry]


def build_table_of_contents_entries(
    sections: list[CellsInASection],
    page_by_cell_id: dict[str, EpubChapter | EpubPartPage],
) -> list[TableOfContentsEntry]:
    entries: list[TableOfContentsEntry] = []
    for section in sections:
        if section.cell.kind == cells.CHAPTER:
            chapter_page = page_by_cell_id[section.cell.unique_id]
            chapter_entry = TableOfContentsEntry(chapter_page.name, chapter_page.filename, [])
            entries.append(chapter_entry)
        elif section.cell.kind == cells.PART:
            part_page = page_by_cell_id[section.cell.unique_id]
            chapter_entries = build_table_of_contents_entries(section.within, page_by_cell_id)
            part_entry = TableOfContentsEntry(part_page.name, part_page.filename, chapter_entries)
            entries.append(part_entry)
    return entries


def render_table_of_contents_items(
    entries: list[TableOfContentsEntry], indent: str, escape_text: Callable[[str], str]
) -> str:
    lines = []
    for entry in entries:
        title = escape_text(entry.title)
        link = f'{indent}<li><a href="{entry.filename}">{title}</a>'
        if not entry.children:
            lines.append(f"{link}</li>")
            continue
        children_items = render_table_of_contents_items(entry.children, indent + "    ", escape_text)
        lines.append(f"{link}\n{indent}  <ol>\n{children_items}\n{indent}  </ol>\n{indent}</li>")
    return "\n".join(lines)


def render_ncx_nav_points(
    entries: list[TableOfContentsEntry], indent: str, play_order: int
) -> tuple[list[str], int]:
    nav_points: list[str] = []
    for entry in entries:
        play_order += 1
        entry_play_order = play_order
        child_nav_points: list[str] = []
        if entry.children:
            child_nav_points, play_order = render_ncx_nav_points(entry.children, indent + "  ", play_order)
        title = html.escape(entry.title)
        children_xml = "\n".join(child_nav_points) + "\n" if child_nav_points else ""
        nav_points.append(
            f'{indent}<navPoint id="np{entry_play_order}" playOrder="{entry_play_order}">\n'
            f"{indent}  <navLabel><text>{title}</text></navLabel>\n"
            f'{indent}  <content src="{entry.filename}"/>\n'
            f"{children_xml}"
            f"{indent}</navPoint>"
        )
    return nav_points, play_order


def table_of_contents_depth(entries: list[TableOfContentsEntry]) -> int:
    return max(
        (1 + table_of_contents_depth(entry.children) for entry in entries),
        default=0,
    )


class EpubTableOfContents(EpubItem):
    def __init__(self, entries: list[TableOfContentsEntry], has_contents_page: bool, book_id: uuid.UUID, book_title: str, language: str) -> None:
        self.entries = entries
        self.has_contents_page = has_contents_page
        self.book_id = book_id
        self.book_title = book_title
        self.language = language

    @classmethod
    def create(
        cls,
        sections: list[CellsInASection],
        page_by_cell_id: dict[str, EpubChapter | EpubPartPage],
        has_contents_page: bool,
        metadata: EpubMetadata,
    ) -> EpubTableOfContents:
        entries = build_table_of_contents_entries(sections, page_by_cell_id)
        table_of_contents = cls(
            entries, has_contents_page, metadata.book_id, metadata.title, metadata.language
        )
        return table_of_contents

    def export(self, epub_writer: tools.EpubWriter) -> None:
        if self.has_contents_page:
            self._export_contents_page(epub_writer)
        self._export_navigation_document(epub_writer)
        self._export_ncx(epub_writer)

    def _export_contents_page(self, epub_writer: tools.EpubWriter) -> None:
        items = render_table_of_contents_items(self.entries, "    ", tools.inline_to_xhtml)
        body_xhtml = (
            '<div class="contents">\n  <h1>Contents</h1>\n  <ol>\n'
            f"{items}\n  </ol>\n</div>"
        )
        epub_writer.write_page(CONTENTS_PAGE_ID, CONTENTS_TITLE, self.language, body_xhtml)

    def _export_navigation_document(self, epub_writer: tools.EpubWriter) -> None:
        language = self.language
        title = html.escape(self.book_title)
        items = render_table_of_contents_items(self.entries, "      ", html.escape)
        body = f"""<nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
{items}
    </ol>
  </nav>"""
        nav_xhtml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{language}" lang="{language}">
<head><meta charset="utf-8"/><title>{title}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  {body}
</body>
</html>
"""
        epub_writer.write_file("OEBPS/nav.xhtml", nav_xhtml)
        epub_writer.add_manifest_item("nav", "nav.xhtml", "application/xhtml+xml", "nav")

    def _export_ncx(self, epub_writer: tools.EpubWriter) -> None:
        nav_points, _ = render_ncx_nav_points(self.entries, "    ", 0)
        depth = max(1, table_of_contents_depth(self.entries))
        title = html.escape(self.book_title)
        nav_map = "\n".join(nav_points)
        ncx = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{self.book_id}"/>
    <meta name="dtb:depth" content="{depth}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{title}</text></docTitle>
  <navMap>
{nav_map}
  </navMap>
</ncx>
"""
        epub_writer.write_file("OEBPS/toc.ncx", ncx)
        epub_writer.add_manifest_item("ncx", "toc.ncx", "application/x-dtbncx+xml")
