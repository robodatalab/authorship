from __future__ import annotations

import html
import mimetypes
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from server.storydoc import Document
from server.publishing.authorship import Authorship

_BOLD = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_STAR = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_ITALIC_UND = re.compile(r"(?<!\w)_(?!_)(.+?)(?<!_)_(?!\w)")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


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


class Chapter:
    def __init__(self, idx: int, title: str | None, body_lines: list[str]):
        self.idx = idx
        self.title = title
        self.body_lines = body_lines
        self.filename = f"chap_{idx:03d}.xhtml"

    @property
    def name(self) -> str:
        return self.title or f"Chapter {self.idx + 1}"

    @property
    def body_xhtml(self) -> str:
        # The `##` that opens a section is not one of its lines, so the chapter
        # carries its own heading back onto the page.
        return f"<h2>{_inline(self.name)}</h2>\n{blocks_to_xhtml(self.body_lines)}"


def chapters_of(document: Document) -> list[Chapter]:
    """A chapter per chapter cell, carrying the prose written under it.

    Which cells those are is the document's to say — a chapter is a cell that
    says it is one, so a heading someone wrote in their prose stays prose.
    """
    return [
        Chapter(index, title, body)
        for index, (title, body) in enumerate(document.chapters())
    ]


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
.disclaimer { text-align: left; font-size: 0.85em; margin-top: 15%; }
.disclaimer p { text-indent: 0; margin: 0 0 0.8em; }
.about { text-align: center; margin-top: 12%; }
.about p.link { text-indent: 0; margin: 0 0 0.8em; }
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


class Page:
    """A document in the book that is not a chapter of the story.

    Front and back matter sit in the spine like chapters but are not what the
    table of contents is for, so they are kept apart from `Chapter` rather than
    made a kind of it.
    """

    def __init__(self, id: str, title: str, body: str):
        self.id = id
        self.title = title
        self.body = body
        self.filename = f"{id}.xhtml"


def build_title_page(title: str, book: Authorship) -> Page:
    said = [f'  <h1 class="book-title">{_inline(title)}</h1>']
    if book.subtitle:
        said.append(f'  <p class="subtitle">{_inline(book.subtitle)}</p>')
    if book.author:
        said.append(f'  <p class="author">{_inline(book.author)}</p>')
    if book.publisher:
        said.append(f'  <p class="publisher">{_inline(book.publisher)}</p>')
    return Page(
        "titlepage", title, '<div class="title-page">\n' + "\n".join(said) + "\n</div>"
    )


def build_disclaimer_page(book: Authorship) -> Page | None:
    if not book.disclaimer:
        return None
    body = blocks_to_xhtml(book.disclaimer.splitlines())
    return Page("disclaimer", "Disclaimer", f'<div class="disclaimer">\n{body}\n</div>')


def build_about_page(book: Authorship) -> Page | None:
    """Where the reader is sent once the story has let them go."""
    sent = [link for link in (book.author_page, book.kindle) if link]
    if not sent:
        return None
    said = [f'  <h2>{_inline(book.author or "The author")}</h2>'] if book.author else []
    said += [
        f'  <p class="link"><a href="{html.escape(link.url, quote=True)}">'
        f"{_inline(link.label)}</a></p>"
        for link in sent
    ]
    return Page("about", "About", '<div class="about">\n' + "\n".join(said) + "\n</div>")


def build_content_opf(book_id, title, book, chapters, front, back, cover_item, modified):
    manifest = [
        '<item id="css" href="style.css" media-type="text/css"/>',
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    ]
    spine = []
    meta_cover = ""

    if cover_item:
        _, img_href, img_media = cover_item
        manifest.append(
            f'<item id="cover-image" href="{img_href}" media-type="{img_media}" properties="cover-image"/>'
        )
        manifest.append(
            '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'
        )
        spine.append('<itemref idref="cover" linear="yes"/>')
        meta_cover = '<meta name="cover" content="cover-image"/>'

    # The reading order is the order of a book: what opens it, the story, then
    # what the reader is left with.
    for document in [*front, *chapters, *back]:
        item_id = getattr(document, "id", None) or document.filename[:-6]
        manifest.append(
            f'<item id="{item_id}" href="{document.filename}" media-type="application/xhtml+xml"/>'
        )
        spine.append(f'<itemref idref="{item_id}"/>')

    described = (
        f"\n    <dc:description>{html.escape(book.blurb)}</dc:description>"
        if book.blurb
        else ""
    )
    published = (
        f"\n    <dc:publisher>{html.escape(book.publisher)}</dc:publisher>"
        if book.publisher
        else ""
    )

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:{book_id}</dc:identifier>
    <dc:title>{html.escape(title)}</dc:title>
    <dc:creator>{html.escape(book.author)}</dc:creator>
    <dc:language>{book.language}</dc:language>{published}{described}
    <meta property="dcterms:modified">{modified}</meta>
    {meta_cover}
  </metadata>
  <manifest>
    {"\n    ".join(manifest)}
  </manifest>
  <spine toc="ncx">
    {"\n    ".join(spine)}
  </spine>
</package>
"""


def build_nav(lang, title, chapters):
    items = "\n".join(
        f'      <li><a href="{ch.filename}">{html.escape(ch.name)}</a></li>'
        for ch in chapters
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


def build_ncx(book_id, title, chapters):
    points = []
    for i, ch in enumerate(chapters, start=1):
        points.append(
            f'    <navPoint id="np{i}" playOrder="{i}">\n'
            f"      <navLabel><text>{html.escape(ch.name)}</text></navLabel>\n"
            f'      <content src="{ch.filename}"/>\n'
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


def build_epub(
    document: Document,
    out_path: Path,
    book: Authorship,
    cover: Path | None,
) -> None:
    """Write the manuscript as an EPUB, dressed in what `book` says about it.

    The document names the book and names its chapters; the authorship carries
    what publishing needs and the story never says. The two are never asked the
    same question, so there is nothing here to reconcile.
    """
    chapters = chapters_of(document)
    title = document.title
    lang = book.language
    front = [
        page
        for page in (build_title_page(title, book), build_disclaimer_page(book))
        if page is not None
    ]
    back = [page for page in (build_about_page(book),) if page is not None]
    book_id = uuid.uuid4()
    modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    cover_item = None
    cover_bytes = None
    if cover:
        media = mimetypes.guess_type(cover.name)[0] or "image/jpeg"
        ext = cover.suffix.lower() or ".jpg"
        cover_href = f"cover{ext}"
        cover_item = ("cover-image", cover_href, media)
        cover_bytes = cover.read_bytes()

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        # mimetype MUST be first and stored uncompressed.
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", CONTAINER_XML)
        z.writestr("OEBPS/style.css", CSS)
        z.writestr(
            "OEBPS/content.opf",
            build_content_opf(
                book_id, title, book, chapters, front, back, cover_item, modified
            ),
        )
        z.writestr("OEBPS/nav.xhtml", build_nav(lang, title, chapters))
        z.writestr("OEBPS/toc.ncx", build_ncx(book_id, title, chapters))

        if cover_item and cover_bytes is not None:
            _, cover_href, _ = cover_item
            z.writestr(f"OEBPS/{cover_href}", cover_bytes)
            cover_body = f'<div class="cover"><img src="{cover_href}" alt="{html.escape(title)}"/></div>'
            z.writestr("OEBPS/cover.xhtml", xhtml_page(lang, title, cover_body))

        for page in [*front, *back]:
            z.writestr(
                f"OEBPS/{page.filename}", xhtml_page(lang, page.title, page.body)
            )

        for ch in chapters:
            z.writestr(
                f"OEBPS/{ch.filename}", xhtml_page(lang, ch.name, ch.body_xhtml)
            )

    print(
        f"Wrote {out_path}  ({len(chapters)} sections, title={title!r}, "
        f"cover={'yes' if cover else 'no'})"
    )
