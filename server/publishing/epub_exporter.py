"""A story document, bound as an EPUB.

Everything the book needs is in the document. The title page names it and
credits it, the cover cell points at its art, the contents cell asks for a table
of contents, the chapters are the story, and the disclaimer and about pages open
and close it. There is no second file carrying half the answer, so there is
nothing here to reconcile.

**The document's order is the book's order.** A cell is printed where it stands,
which is why there is no list of front matter to keep in step with the writing:
move the disclaimer above the title page in the editor and it is above it in the
book.
"""

from __future__ import annotations

import html
import mimetypes
import re
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from server.storydoc import (
    ABOUT,
    BUILT_KINDS,
    CHAPTER,
    CONTENTS,
    COVER,
    DISCLAIMER,
    PRIVATE_KINDS,
    TITLE_PAGE,
    Cell,
    Document,
)

# A cell whose text is neither a page of the book nor part of one: built from the
# document, or kept beside it and published nowhere.
UNPRINTED = BUILT_KINDS | PRIVATE_KINDS

DEFAULT_LANGUAGE = "en"

_BOLD = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_STAR = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_ITALIC_UND = re.compile(r"(?<!\w)_(?!_)(.+?)(?<!_)_(?!\w)")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_IMAGE = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")


def _inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _ITALIC_STAR.sub(r"<em>\1</em>", text)
    text = _ITALIC_UND.sub(r"<em>\1</em>", text)
    text = _LINK.sub(
        lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>',
        text,
    )
    return text


def blocks_to_xhtml(lines: list[str]) -> str:
    out: list[str] = []
    para: list[str] = []

    def flush() -> None:
        if para:
            out.append(f"<p>{_inline(' '.join(para))}</p>")
            para.clear()

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:  # blank line -> paragraph break
            flush()
        elif re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            flush()
            out.append('<hr class="scene-break"/>')
        elif stripped.startswith("### "):
            flush()
            out.append(f"<h3>{_inline(stripped[4:].strip())}</h3>")
        elif stripped.startswith("## "):
            flush()
            out.append(f"<h2>{_inline(stripped[3:].strip())}</h2>")
        elif stripped.startswith("# "):
            flush()
            out.append(f"<h1>{_inline(stripped[2:].strip())}</h1>")
        else:
            para.append(stripped)
    flush()
    return "\n".join(out)


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
    language: str = DEFAULT_LANGUAGE


def imprint_of(document: Document) -> Imprint:
    said = next(
        (cell.attrs for cell in document.cells if cell.kind == TITLE_PAGE), {}
    )
    return Imprint(
        title=document.title,
        subtitle=said.get("subtitle", ""),
        author=said.get("author", ""),
        publisher=said.get("publisher", ""),
        date=said.get("date", ""),
        version=said.get("version", ""),
        isbn=said.get("isbn", ""),
        language=said.get("language") or DEFAULT_LANGUAGE,
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
        return (
            f'<div class="chapter">\n<h2>{_inline(self.name)}</h2>\n'
            f"{blocks_to_xhtml(self.body_lines)}\n</div>"
        )


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


class Cover:
    """The art the book opens with, and the page that shows it."""

    def __init__(self, art: Path, title: str):
        self.art = art
        self.href = f"cover{art.suffix.lower() or '.jpg'}"
        self.media = mimetypes.guess_type(art.name)[0] or "image/jpeg"
        self.page = Page(
            "cover",
            title,
            f'<div class="cover"><img src="{self.href}"'
            f' alt="{html.escape(title, quote=True)}"/></div>',
        )


@dataclass
class Book:
    """A document read as the thing it will be printed as."""

    imprint: Imprint
    documents: list[Chapter | Page]
    cover: Cover | None

    @property
    def chapters(self) -> list[Chapter]:
        return [item for item in self.documents if isinstance(item, Chapter)]

    @property
    def listed(self) -> list[Chapter | Page]:
        """What the table of contents points at."""
        return [item for item in self.documents if item.in_toc]


# Prose the author left standing outside every chapter — a dedication, an
# epigraph, a note to the reader. Printed where it stands rather than swallowed
# by a chapter it was never part of.
LOOSE = "page_"


def read_book(document: Document) -> Book:
    """The book the document lays out, in the order it lays it out.

    Which cells are pages and which are the story is the kind's to say, so a
    chapter called "Disclaimer" is a chapter and a disclaimer standing between
    two chapters is still its own page.
    """
    imprint = imprint_of(document)
    root = document.path.parent if document.path else Path()
    documents: list[Chapter | Page] = []
    listings: list[Page] = []
    cover: Cover | None = None
    chapters = 0

    for cell in document.cells:
        if cell.kind == CHAPTER:
            documents.append(Chapter(chapters, cell.title, []))
            chapters += 1
        elif cell.kind == TITLE_PAGE:
            documents.append(build_title_page(imprint))
        elif cell.kind == COVER:
            art = _art_of(cell, root)
            if art and cover is None:
                cover = Cover(art, imprint.title)
                documents.append(cover.page)
        elif cell.kind == CONTENTS:
            # Built here rather than taken from the cell: on the page a table of
            # contents is a list of names, in a book it is a list of links.
            listing = Page("contents", "Contents", "")
            listings.append(listing)
            documents.append(listing)
        elif cell.kind == DISCLAIMER:
            page = build_disclaimer_page(cell)
            if page:
                documents.append(page)
        elif cell.kind == ABOUT:
            page = build_about_page(cell)
            if page:
                documents.append(page)
        elif cell.source and cell.kind not in UNPRINTED:
            _add_prose(documents, cell)

    built = contents_xhtml([item for item in documents if isinstance(item, Chapter)])
    for listing in listings:
        listing.body_xhtml = built
    _name_apart(documents)
    return Book(imprint, documents, cover)


def chapters_of(document: Document) -> list[Chapter]:
    """A chapter per chapter cell, carrying the prose written under it."""
    return read_book(document).chapters


def _add_prose(documents: list[Chapter | Page], cell: Cell) -> None:
    if documents and isinstance(documents[-1], Chapter):
        body = documents[-1].body_lines
        if body:
            body.append("")
        body.extend(cell.source.splitlines())
        return
    loose = sum(1 for item in documents if item.id.startswith(LOOSE))
    written = blocks_to_xhtml(cell.source.splitlines())
    documents.append(
        Page(f"{LOOSE}{loose:03d}", "", f'<div class="chapter">\n{written}\n</div>')
    )


def _art_of(cell: Cell, root: Path) -> Path | None:
    """The image the cover cell points at, if it is really there.

    A cell still carrying the placeholder the editor gave it names a file nobody
    has drawn yet, and a book goes out without a cover rather than not at all.
    """
    src = cell.attrs.get("src") or _first_image(cell.source)
    if not src:
        return None
    art = root / src
    return art if art.is_file() else None


def _first_image(source: str) -> str:
    found = _IMAGE.search(source)
    return found.group(1) if found else ""


def _name_apart(documents: list[Chapter | Page]) -> None:
    # Nothing stops an author from adding a second disclaimer, and two manifest
    # items under one id is a book no reader will open.
    seen: dict[str, int] = {}
    for item in documents:
        seen[item.id] = seen.get(item.id, 0) + 1
        if seen[item.id] > 1:
            item.id = f"{item.id}_{seen[item.id]}"
            item.filename = f"{item.id}.xhtml"


CONTAINER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

CSS = """\
html, body { margin: 0; padding: 0; }
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5;
       text-align: justify; hyphens: auto; }
/* The page's own margin, set on the content and not on the body so that the
   cover can still fill the page edge to edge. Without it the first-line indent
   is the only white space on the page and reads as a stray offset rather than
   as the paragraph opening it is. */
.chapter, .title-page, .contents, .disclaimer, .about { padding: 0 6%; }
/* No page-break-before here: every chapter is its own spine document, so the
   reader already opens a page for it. Breaking again leaves a blank one. */
h1, h2, h3 { font-family: Georgia, serif; text-align: center; font-weight: normal;
             line-height: 1.25; }
h1 { font-size: 1.9em; margin: 2.5em 0 0.6em; }
h2 { font-size: 1.5em; margin: 2.2em 0 1em; }
h3 { font-size: 1.2em; margin: 1.6em 0 0.8em; font-style: italic; }
p { margin: 0; text-indent: 1.4em; }
p:first-of-type, h1 + p, h2 + p, h3 + p, hr + p { text-indent: 0; }
hr.scene-break { border: 0; text-align: center; margin: 1.4em 0; }
hr.scene-break::after { content: "\\2042"; font-size: 1.2em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; height: auto; }
.title-page { text-align: center; margin-top: 25%; }
.title-page h1.book-title { font-size: 2.4em; margin: 0 0 0.4em; }
.title-page p { text-indent: 0; }
.title-page p.subtitle { font-size: 1.3em; font-style: italic; margin: 0 0 2.5em; }
.title-page p.author { font-size: 1.2em; margin: 0 0 0.6em; }
.title-page p.publisher { font-size: 0.9em; letter-spacing: 0.08em;
                          text-transform: uppercase; }
.title-page p.imprint { font-size: 0.8em; margin: 3em 0 0; }
.contents ol { list-style: none; padding: 0; text-align: center; }
.contents li { margin: 0 0 0.8em; }
.contents a { text-decoration: none; }
.disclaimer { text-align: left; font-size: 0.85em; margin-top: 15%; }
.disclaimer p { text-indent: 0; margin: 0 0 0.8em; }
/* The blurb is prose and is set like prose; only the list of places to go is
   centred, because that is a list and not something anyone reads across. */
.about { margin-top: 12%; }
.about p { text-indent: 0; margin: 0 0 0.8em; }
.about .links { margin-top: 2.5em; text-align: center; }
.about .links p { margin: 0 0 0.9em; }
"""

XHTML_DOC = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}" lang="{lang}">
<head>
  <meta charset="utf-8"/>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
{body}
</body>
</html>
"""


def xhtml_page(lang: str, title: str, body: str) -> str:
    return XHTML_DOC.format(lang=lang, title=html.escape(title), body=body)


def build_title_page(imprint: Imprint) -> Page:
    said = [f'  <h1 class="book-title">{_inline(imprint.title)}</h1>']
    if imprint.subtitle:
        said.append(f'  <p class="subtitle">{_inline(imprint.subtitle)}</p>')
    if imprint.author:
        said.append(f'  <p class="author">{_inline(imprint.author)}</p>')
    if imprint.publisher:
        said.append(f'  <p class="publisher">{_inline(imprint.publisher)}</p>')

    # What a copyright page would carry, printed at the foot of the title page:
    # this edition, when it was made, and the number it is sold under.
    printed = []
    if imprint.date:
        printed.append(imprint.date)
    if imprint.version:
        printed.append(f"Version {imprint.version}")
    if imprint.isbn:
        printed.append(f"ISBN {imprint.isbn}")
    if printed:
        said.append(f'  <p class="imprint">{_inline(" · ".join(printed))}</p>')

    return Page(
        "titlepage",
        imprint.title,
        '<div class="title-page">\n' + "\n".join(said) + "\n</div>",
    )


def contents_xhtml(chapters: list[Chapter]) -> str:
    items = "\n".join(
        f'    <li><a href="{ch.filename}">{_inline(ch.name)}</a></li>'
        for ch in chapters
    )
    return (
        '<div class="contents">\n  <h1>Contents</h1>\n  <ol>\n'
        f"{items}\n  </ol>\n</div>"
    )


def build_disclaimer_page(cell: Cell) -> Page | None:
    """The page the reader turns past on the way in, headed by its own name."""
    if not cell.source.strip():
        return None
    name = cell.title or "Disclaimer"
    body = blocks_to_xhtml(cell.source.splitlines())
    return Page(
        "disclaimer",
        name,
        f'<div class="disclaimer">\n<h2>{_inline(name)}</h2>\n{body}\n</div>',
        in_toc=True,
    )


# Where the reader is sent once the story has let them go. Mirrors the editor's
# own list, so a link added there is a link printed here.
AUTHOR_LINKS = [
    ("kdp", "Books on Amazon"),
    ("website", "Website"),
    ("substack", "Substack"),
]

ABOUT_TITLE = "About the Author"


def build_about_page(cell: Cell) -> Page | None:
    """The author, in their own words, and where to find them.

    Every part of it is optional, and a page with nothing written and nowhere to
    send anyone is not printed — an empty "About the Author" is worse than no
    page at all.
    """
    sent = [
        (label, cell.attrs[name]) for name, label in AUTHOR_LINKS if cell.attrs.get(name)
    ]
    blurb = cell.source.strip()
    if not sent and not blurb:
        return None

    said = [f"  <h2>{ABOUT_TITLE}</h2>"]
    if blurb:
        said.append(blocks_to_xhtml(blurb.splitlines()))
    if sent:
        # Kept apart from the blurb and one to a line: this is a list of places to
        # go, and a reader runs their eye down it rather than reading it.
        said.append('  <div class="links">')
        said += [
            f'    <p><a href="{html.escape(url, quote=True)}">{_inline(label)}</a></p>'
            for label, url in sent
        ]
        said.append("  </div>")
    return Page(
        "about",
        ABOUT_TITLE,
        '<div class="about">\n' + "\n".join(said) + "\n</div>",
        in_toc=True,
    )


def build_content_opf(book_id: uuid.UUID, book: Book, modified: str) -> str:
    imprint = book.imprint
    manifest = [
        '<item id="css" href="style.css" media-type="text/css"/>',
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    ]
    said = [
        f'<dc:identifier id="book-id">urn:uuid:{book_id}</dc:identifier>',
        f"<dc:title>{html.escape(imprint.title)}</dc:title>",
        f"<dc:language>{html.escape(imprint.language)}</dc:language>",
    ]
    if imprint.author:
        said.append(f"<dc:creator>{html.escape(imprint.author)}</dc:creator>")
    if imprint.publisher:
        said.append(f"<dc:publisher>{html.escape(imprint.publisher)}</dc:publisher>")
    if imprint.date:
        said.append(f"<dc:date>{html.escape(imprint.date)}</dc:date>")
    if imprint.isbn:
        said.append(
            f'<dc:identifier id="isbn">urn:isbn:{html.escape(imprint.isbn)}</dc:identifier>'
        )
    said.append(f'<meta property="dcterms:modified">{modified}</meta>')

    if book.cover:
        manifest.append(
            f'<item id="cover-image" href="{book.cover.href}"'
            f' media-type="{book.cover.media}" properties="cover-image"/>'
        )
        said.append('<meta name="cover" content="cover-image"/>')

    spine = []
    for item in book.documents:
        manifest.append(
            f'<item id="{item.id}" href="{item.filename}" media-type="application/xhtml+xml"/>'
        )
        spine.append(f'<itemref idref="{item.id}"/>')

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    {"\n    ".join(said)}
  </metadata>
  <manifest>
    {"\n    ".join(manifest)}
  </manifest>
  <spine toc="ncx">
    {"\n    ".join(spine)}
  </spine>
</package>
"""


def build_nav(lang: str, title: str, listed: list[Chapter | Page]) -> str:
    items = "\n".join(
        f'      <li><a href="{item.filename}">{html.escape(item.name)}</a></li>'
        for item in listed
    )
    body = f"""<nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
{items}
    </ol>
  </nav>"""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}" lang="{lang}">
<head><meta charset="utf-8"/><title>{html.escape(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  {body}
</body>
</html>
"""


def build_ncx(book_id: uuid.UUID, title: str, listed: list[Chapter | Page]) -> str:
    points = []
    for i, item in enumerate(listed, start=1):
        points.append(
            f'    <navPoint id="np{i}" playOrder="{i}">\n'
            f"      <navLabel><text>{html.escape(item.name)}</text></navLabel>\n"
            f'      <content src="{item.filename}"/>\n'
            f"    </navPoint>"
        )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{book_id}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{html.escape(title)}</text></docTitle>
  <navMap>
{chr(10).join(points)}
  </navMap>
</ncx>
"""


def build_epub(document: Document, out_path: Path) -> None:
    """Write the document as an EPUB, dressed in what the document says about it."""
    book = read_book(document)
    lang = book.imprint.language
    title = book.imprint.title
    book_id = uuid.uuid4()
    modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        # mimetype MUST be first and stored uncompressed.
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", CONTAINER_XML)
        z.writestr("OEBPS/style.css", CSS)
        z.writestr("OEBPS/content.opf", build_content_opf(book_id, book, modified))
        z.writestr("OEBPS/nav.xhtml", build_nav(lang, title, book.listed))
        z.writestr("OEBPS/toc.ncx", build_ncx(book_id, title, book.listed))

        if book.cover:
            z.writestr(f"OEBPS/{book.cover.href}", book.cover.art.read_bytes())

        for item in book.documents:
            z.writestr(
                f"OEBPS/{item.filename}",
                xhtml_page(lang, item.name or title, item.body_xhtml),
            )
