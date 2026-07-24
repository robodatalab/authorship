from __future__ import annotations

import html
import mimetypes
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

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
    def __init__(self, idx: int, title: str, body_lines: list[str]):
        self.idx = idx
        self.title = title
        self.body_lines = body_lines
        self.filename = f"chap_{idx:03d}.xhtml"

    @property
    def body_xhtml(self) -> str:
        return blocks_to_xhtml(self.body_lines)


def parse_manuscript(md: str) -> tuple[str, list[Chapter]]:
    lines = md.splitlines()
    title = "Untitled"
    for line in lines:
        if line.startswith("# ") and not line.startswith("## "):
            title = line[2:].strip()
            break

    chapters: list[Chapter] = []
    front: list[str] = []
    current_title: str | None = None
    current: list[str] = []
    idx = 0

    def close() -> None:
        nonlocal idx
        if current_title is not None:
            chapters.append(Chapter(idx, current_title, list(current)))
            idx += 1

    for line in lines:
        if line.startswith("## "):
            if current_title is None and front:
                chapters.append(Chapter(idx, title, list(front)))
                idx += 1
                front.clear()
            close()
            current_title = line[3:].strip()
            current = []
        elif current_title is None:
            front.append(line)
        else:
            current.append(line)
    close()

    # No '## ' headings at all -> whole doc is one chapter.
    if not chapters:
        chapters.append(Chapter(0, title, front or lines))
    return title, chapters


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
h1, h2, h3 { font-family: Georgia, serif; text-align: center; font-weight: normal;
             line-height: 1.25; page-break-before: always; }
h1 { font-size: 1.9em; margin: 2.5em 0 0.6em; }
h2 { font-size: 1.5em; margin: 2.2em 0 1em; }
h3 { font-size: 1.2em; margin: 1.6em 0 0.8em; font-style: italic; }
p { margin: 0; text-indent: 1.4em; }
p:first-of-type, h1 + p, h2 + p, h3 + p, hr + p { text-indent: 0; }
hr.scene-break { border: 0; text-align: center; margin: 1.4em 0; }
hr.scene-break::after { content: "\\2042"; font-size: 1.2em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; height: auto; }
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


def build_content_opf(book_id, title, author, lang, chapters, cover_item, modified):
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

    for ch in chapters:
        manifest.append(
            f'<item id="{ch.filename[:-6]}" href="{ch.filename}" media-type="application/xhtml+xml"/>'
        )
        spine.append(f'<itemref idref="{ch.filename[:-6]}"/>')

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:{book_id}</dc:identifier>
    <dc:title>{html.escape(title)}</dc:title>
    <dc:creator>{html.escape(author)}</dc:creator>
    <dc:language>{lang}</dc:language>
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
        f'      <li><a href="{ch.filename}">{html.escape(ch.title)}</a></li>'
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
            f"      <navLabel><text>{html.escape(ch.title)}</text></navLabel>\n"
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
    md_path: Path,
    out_path: Path,
    cover: Path | None,
    title: str | None,
    author: str,
    lang: str,
) -> None:
    md = md_path.read_text(encoding="utf-8")
    detected_title, chapters = parse_manuscript(md)
    title = title or detected_title
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
                book_id, title, author, lang, chapters, cover_item, modified
            ),
        )
        z.writestr("OEBPS/nav.xhtml", build_nav(lang, title, chapters))
        z.writestr("OEBPS/toc.ncx", build_ncx(book_id, title, chapters))

        if cover_item and cover_bytes is not None:
            _, cover_href, _ = cover_item
            z.writestr(f"OEBPS/{cover_href}", cover_bytes)
            cover_body = f'<div class="cover"><img src="{cover_href}" alt="{html.escape(title)}"/></div>'
            z.writestr("OEBPS/cover.xhtml", xhtml_page(lang, title, cover_body))

        for ch in chapters:
            z.writestr(
                f"OEBPS/{ch.filename}", xhtml_page(lang, ch.title, ch.body_xhtml)
            )

    print(
        f"Wrote {out_path}  ({len(chapters)} sections, title={title!r}, "
        f"cover={'yes' if cover else 'no'})"
    )
