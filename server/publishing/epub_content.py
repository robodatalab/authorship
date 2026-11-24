from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path

from authordoc.storydoc import Document

from server.publishing.markdown_to_xhtml_converter import SECTION_TITLE, _inline, blocks_to_xhtml

DEFAULT_LANGUAGE = "en"

# A name with nothing under it: a part divider, or a chapter whose prose has not
# been written yet. The reader turns to a page holding one line, and it is set in
# the middle of that page rather than at the top of it.
ALONE_ON_THE_PAGE = "alone-on-the-page"


@dataclass(frozen=True)
class Imprint:
    """What the book says about itself, which only its title page says.

    Read from one cell so there is one answer to each question. A document with
    no title page still has an imprint — the defaults — rather than no book.
    """

    title: str = "Anonymous"
    subtitle: str = ""
    author: str = ""
    publisher: str = ""
    date: str = ""
    version: str = ""
    isbn: str = ""
    cover_designer: str = ""
    language: str = DEFAULT_LANGUAGE


def imprint_of(document: Document) -> Imprint:
    said = document.title_page
    return Imprint(
        title=document.title,
        subtitle=said.subtitle,
        author=said.author,
        publisher=said.publisher,
        date=said.date,
        version=said.version,
        isbn=said.isbn,
        cover_designer=said.cover_designer,
        language=said.language or DEFAULT_LANGUAGE,
    )


class Chapter:
    """A named place in the story, and the prose written under it."""

    in_toc = True

    def __init__(self, idx: int, title: str, body_lines: list[str]):
        self.idx = idx
        self.title = title
        self.body_lines = body_lines
        self.id = f"chap_{idx:03d}"
        self.filename = f"{self.id}.xhtml"

    @property
    def name(self) -> str:
        return self.title or f"Chapter {self.idx + 1}"

    @property
    def body_xhtml(self) -> str:
        # A chapter cell carries the name and no prose of its own, so the heading
        # is put back onto the page here.
        name = f"<h{SECTION_TITLE}>{_inline(self.name)}</h{SECTION_TITLE}>"
        written = blocks_to_xhtml(self.body_lines)
        if not written:
            return f'<div class="{ALONE_ON_THE_PAGE}">\n{name}\n</div>'
        return f'<div class="chapter">\n{name}\n{written}\n</div>'


class Page:
    """A document in the book that is not a chapter of the story.

    Front and back matter sit in the spine like chapters but are not what the
    table of contents is for, so `in_toc` is theirs to say: a reader looks up the
    disclaimer, never the title page.
    """

    def __init__(self, id: str, name: str, body_xhtml: str, in_toc: bool = False):
        self.id = id
        self.name = name
        self.body_xhtml = body_xhtml
        self.in_toc = in_toc
        self.filename = f"{id}.xhtml"


class Part(Page):
    def __init__(self, name: str, body_xhtml: str):
        super().__init__("part", name, body_xhtml, in_toc=True)


@dataclass
class Listing:
    item: Chapter | Page
    within: list["Listing"]


class Art:
    def __init__(self, id: str, source: Path):
        self.id = id
        self.source = source
        self.href = f"{id}{source.suffix.lower() or '.jpg'}"
        self.media = mimetypes.guess_type(source.name)[0] or "image/jpeg"


@dataclass
class EpubDocument:
    imprint: Imprint
    documents: list[Chapter | Page]
    art: list[Art]
    cover: Art | None

    @property
    def chapters(self) -> list[Chapter]:
        return [item for item in self.documents if isinstance(item, Chapter)]

    @property
    def listing(self) -> list["Listing"]:
        """What the table of contents points at, chapters under their part."""
        return listing_of(self.documents)


def listing_of(documents: list[Chapter | Page]) -> list[Listing]:
    listing: list[Listing] = []
    under: Listing | None = None
    for item in documents:
        if not item.in_toc:
            continue
        entry = Listing(item, [])
        if isinstance(item, Chapter) and under is not None:
            under.within.append(entry)
            continue
        listing.append(entry)
        under = entry if isinstance(item, Part) else None
    return listing
