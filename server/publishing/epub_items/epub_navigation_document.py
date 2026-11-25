from __future__ import annotations

import html
from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing.epub_items.listing import Listing, links_in_the_listing


@dataclass
class EpubNavigationDocument(EpubItem):
    metadata: EpubMetadata
    table_of_contents: list[Listing]

    def export(self, epub_writer: EpubWriter) -> None:
        language = self.metadata.language
        title = html.escape(self.metadata.title)
        items = links_in_the_listing(self.table_of_contents, "      ", html.escape)
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
