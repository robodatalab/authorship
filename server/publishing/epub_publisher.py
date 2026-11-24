"""Exporter of Documents to epub format"""

from __future__ import annotations

import html
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from authordoc.storydoc import Document

from server.publishing.document_to_epub_content_converter import read_book
from server.publishing.epub_content import EpubDocument, Listing
from server.publishing.epub_xhtml_exporter import links_in_the_listing

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
   cover can still fill the page edge to edge. */
.chapter, .title-page, .contents, .disclaimer, .about, .copyright,
.alone-on-the-page { padding: 0 6%; }
/* No page-break-before here: every chapter is its own spine document, so the
   reader already opens a page for it. Breaking again leaves a blank one. */
h1, h2, h3, h4, h5 { font-family: Georgia, serif; text-align: center;
                     font-weight: normal; line-height: 1.25; }
h1 { font-size: 1.9em; margin: 2.5em 0 0.6em; }
h2 { font-size: 1.5em; margin: 2.2em 0 1em; }
h3 { font-size: 1.2em; margin: 1.6em 0 0.8em; font-style: italic; }
h4 { font-size: 1.05em; margin: 1.4em 0 0.7em; }
h5 { font-size: 1em; margin: 1.2em 0 0.6em; font-style: italic; }
p { margin: 0 0 0.8em; }
hr.scene-break { border: 0; text-align: center; margin: 1.4em 0; }
hr.scene-break::after { content: "\\2042"; font-size: 1.2em; }
/* A part is one line on an otherwise empty page, set in the middle of it both
   ways. The height is the reader's page rather than the text's, which is what
   lets the line be centred against something. */
.alone-on-the-page { display: flex; flex-direction: column;
                     justify-content: center; align-items: center;
                     height: 100vh; text-align: center; }
.alone-on-the-page h1, .alone-on-the-page h2 { margin: 0; }
.cover, .image-page { text-align: center; margin: 0; padding: 0; }
.cover img, .image-page img { max-width: 100%; height: auto; }
/* A picture standing in the prose is one thing on the page among others, so it
   is held to a share of the page's height and the words go on around it. */
p.image { text-align: center; margin: 1.2em 0; }
p.image img { max-width: 100%; max-height: 45vh; width: auto; height: auto; }
.title-page { text-align: center; margin-top: 25%; }
.title-page h1.book-title { font-size: 2.4em; margin: 0 0 0.4em; }
.title-page p.subtitle { font-size: 1.3em; font-style: italic; margin: 0 0 2.5em; }
.title-page p.author { font-size: 1.2em; margin: 0 0 0.6em; }
.title-page p.publisher { font-size: 0.9em; letter-spacing: 0.08em;
                          text-transform: uppercase; }
.contents ol { text-align: left; padding-left: 2em; margin: 0; }
.contents ol ol { margin: 0.6em 0 0; }
.contents li { margin: 0 0 0.8em; }
.contents a { text-decoration: none; }
.disclaimer { text-align: left; font-size: 0.85em; margin-top: 15%; }
.copyright { text-align: left; font-size: 0.8em; margin-top: 20%; }
.copyright p { margin: 0 0 1.2em; }
/* The blurb is prose and is set like prose; only the list of places to go is
   centred, because that is a list and not something anyone reads across. */
.about { margin-top: 12%; }
/* The portrait and the links stand side by side, and are set inline rather than
   in a flex row so that a reader without either falls back to one above the
   other instead of to a heap. */
.about .who { text-align: center; margin-bottom: 2.5em; }
.about .who .portrait, .about .who .links { display: inline-block;
                                            vertical-align: middle; }
.about .who .portrait { width: 34%; height: auto; margin-right: 4%; }
.about .who .links { width: 46%; }
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


def build_content_opf(book_id: uuid.UUID, book: EpubDocument, modified: str) -> str:
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

    for picture in book.art:
        if picture is book.cover:
            manifest.append(
                f'<item id="cover-image" href="{picture.href}"'
                f' media-type="{picture.media}" properties="cover-image"/>'
            )
            said.append('<meta name="cover" content="cover-image"/>')
            continue
        manifest.append(
            f'<item id="{picture.id}" href="{picture.href}"'
            f' media-type="{picture.media}"/>'
        )

    spine = []
    for item in book.documents:
        manifest.append(
            f'<item id="{item.id}" href="{item.filename}" media-type="application/xhtml+xml"/>'
        )
        spine.append(f'<itemref idref="{item.id}"/>')

    indent = "\n    "
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    {indent.join(said)}
  </metadata>
  <manifest>
    {indent.join(manifest)}
  </manifest>
  <spine toc="ncx">
    {indent.join(spine)}
  </spine>
</package>
"""


def build_nav(lang: str, title: str, listing: list[Listing]) -> str:
    items = links_in_the_listing(listing, "      ", html.escape)
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


def nav_points(
    listing: list[Listing], indent: str, played: int
) -> tuple[list[str], int]:
    points: list[str] = []
    for entry in listing:
        played += 1
        at = played
        held: list[str] = []
        if entry.within:
            held, played = nav_points(entry.within, indent + "  ", played)
        points.append(
            f'{indent}<navPoint id="np{at}" playOrder="{at}">\n'
            f"{indent}  <navLabel><text>{html.escape(entry.item.name)}</text>"
            f"</navLabel>\n"
            f'{indent}  <content src="{entry.item.filename}"/>\n'
            + ("\n".join(held) + "\n" if held else "")
            + f"{indent}</navPoint>"
        )
    return points, played


def how_deep_the_listing_goes(listing: list[Listing]) -> int:
    return max(
        (1 + how_deep_the_listing_goes(entry.within) for entry in listing),
        default=0,
    )


def build_ncx(book_id: uuid.UUID, title: str, listing: list[Listing]) -> str:
    points, _ = nav_points(listing, "    ", 0)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{book_id}"/>
    <meta name="dtb:depth" content="{max(1, how_deep_the_listing_goes(listing))}"/>
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
        z.writestr("OEBPS/nav.xhtml", build_nav(lang, title, book.listing))
        z.writestr("OEBPS/toc.ncx", build_ncx(book_id, title, book.listing))

        for picture in book.art:
            z.writestr(f"OEBPS/{picture.href}", picture.source.read_bytes())

        for item in book.documents:
            z.writestr(
                f"OEBPS/{item.filename}",
                xhtml_page(lang, item.name or title, item.body_xhtml),
            )
