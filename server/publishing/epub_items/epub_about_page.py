from __future__ import annotations

import html
from dataclasses import dataclass

from authordoc import cells

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing.markdown_to_xhtml_converter import SECTION_TITLE, _inline, blocks_to_xhtml

ABOUT_TITLE = "About the Author"


@dataclass
class EpubAboutPage(EpubItem):

    id: str
    kdp: str
    website: str
    substack: str
    blurb: str
    portrait: str
    author: str
    language: str

    @classmethod
    def create(cls, cell: cells.AboutCell, portrait: str, metadata: EpubMetadata) -> EpubAboutPage:
        about_page = cls(
            "about",
            cell.kdp,
            cell.website,
            cell.substack,
            cell.source,
            portrait,
            metadata.author,
            metadata.language,
        )
        return about_page

    def export(self, epub_writer: EpubWriter) -> None:
        # Where the reader is sent once the story has let them go. Mirrors the editor's
        # own list, so a link added there is a link printed here.
        author_links = [
            ("Books on Amazon", self.kdp),
            ("Website", self.website),
            ("Substack", self.substack),
        ]
        links = [(label, link) for label, link in author_links if link]
        blurb = self.blurb.strip()

        about_lines = [f"  <h{SECTION_TITLE}>{ABOUT_TITLE}</h{SECTION_TITLE}>"]
        if links or self.portrait:
            # The face and the list of places to go, side by side under the heading:
            # a reader looks at both at once rather than reading down them.
            about_lines.append('  <div class="who">')
            if self.portrait:
                portrait_alt = html.escape(self.author, quote=True)
                about_lines.append(
                    f'    <img class="portrait" src="{self.portrait}" alt="{portrait_alt}"/>'
                )
            if links:
                about_lines.append('    <div class="links">')
                about_lines += [
                    f'      <p><a href="{html.escape(url, quote=True)}">{_inline(label)}</a></p>'
                    for label, url in links
                ]
                about_lines.append("    </div>")
            about_lines.append("  </div>")
        if blurb:
            blurb_lines = blurb.splitlines()
            blurb_xhtml = blocks_to_xhtml(blurb_lines)
            about_lines.append(blurb_xhtml)
        joined_lines = "\n".join(about_lines)
        body_xhtml = f'<div class="about">\n{joined_lines}\n</div>'
        epub_writer.write_page(self.id, ABOUT_TITLE, self.language, body_xhtml)
