from __future__ import annotations

import html
import re
from collections.abc import Callable
from datetime import datetime, timezone

from authordoc.cells.about_cell import AboutCell
from authordoc.cells.disclaimer_cell import DisclaimerCell
from authordoc.cells.part_cell import PartCell

from server.publishing.epub_content import ALONE_ON_THE_PAGE, Art, Chapter, Imprint, Listing, Page, Part
from server.publishing.markdown_to_xhtml_converter import SECTION_TITLE, _inline, blocks_to_xhtml


def build_title_page(imprint: Imprint) -> Page:
    said = [f'  <h1 class="book-title">{_inline(imprint.title)}</h1>']
    if imprint.subtitle:
        said.append(f'  <p class="subtitle">{_inline(imprint.subtitle)}</p>')
    if imprint.author:
        said.append(f'  <p class="author">{_inline(imprint.author)}</p>')
    if imprint.publisher:
        said.append(f'  <p class="publisher">{_inline(imprint.publisher)}</p>')

    return Page(
        "titlepage",
        imprint.title,
        '<div class="title-page">\n' + "\n".join(said) + "\n</div>",
    )


# What the page says whatever book it stands in, and what it says about this one.
RIGHTS = (
    "No part of this publication may be reproduced, distributed, or transmitted "
    "in any form without the prior written permission of the publisher, except "
    "for brief quotations in reviews."
)
MORAL_RIGHTS = (
    "The right of {named} to be identified as the author of this work has been "
    "asserted in accordance with the Copyright, Designs and Patents Act 1988."
)
COPYRIGHT_TITLE = "Copyright"

_YEAR = re.compile(r"\d{4}")


def copyright_year(date: str) -> str:
    """The year the edition is dated, or the year it is being bound in.

    The date is the author's own line rather than a form to fill in, so the year
    is read out of whatever they wrote and only falls back to today when they
    wrote nothing a year can be read from.
    """
    found = _YEAR.search(date)
    return found.group() if found else str(datetime.now(timezone.utc).year)


def build_copyright_page(imprint: Imprint) -> Page:
    """Who owns the book, what may be done with it, and which edition it is.

    Built from the title page rather than written by the author: every fact on it
    is one the title page already carries, and a copyright page that disagreed
    with the title page would be the one thing worse than not having one.
    """
    year = copyright_year(imprint.date)
    named = " and ".join(
        who for who in (imprint.author, imprint.publisher) if who
    )
    held = f"Copyright © {year} {named}".strip()
    said = [f"  <p>{_inline(held)}. All rights reserved.</p>", f"  <p>{RIGHTS}</p>"]
    if imprint.author:
        said.append(f"  <p>{_inline(MORAL_RIGHTS.format(named=named))}</p>")
    if imprint.cover_designer:
        said.append(f"  <p>Cover design by {_inline(imprint.cover_designer)}</p>")
    if imprint.publisher:
        said.append(f"  <p>Published by {_inline(imprint.publisher)}</p>")

    edition = []
    if imprint.version:
        edition.append(f"Version {imprint.version}")
    if imprint.date:
        edition.append(imprint.date)
    if edition:
        said.append(f'  <p>{_inline(" · ".join(edition))}</p>')
    if imprint.isbn:
        said.append(f"  <p>ISBN {_inline(imprint.isbn)}</p>")

    return Page(
        "copyright",
        COPYRIGHT_TITLE,
        '<div class="copyright">\n' + "\n".join(said) + "\n</div>",
    )


def build_cover_page(art: Art, title: str) -> Page:
    return Page(
        "cover",
        title,
        f'<div class="cover"><img src="{art.href}"'
        f' alt="{html.escape(title, quote=True)}"/></div>',
    )


def build_image_page(art: Art) -> Page:
    return Page(
        f"{art.id}_page",
        "",
        f'<div class="image-page"><img src="{art.href}" alt=""/></div>',
    )


def build_part_page(idx: int, cell: PartCell) -> Part:
    """The divider a reader turns to before the chapters under it.

    A page of its own carrying one line: every document in the spine opens a
    page, so the name stands alone with nothing above or below it.
    """
    name = cell.title or f"Part {idx + 1}"
    return Part(
        name,
        f'<div class="{ALONE_ON_THE_PAGE}">\n<h1>{_inline(name)}</h1>\n</div>',
    )


def links_in_the_listing(
    listing: list[Listing], indent: str, named: Callable[[str], str]
) -> str:
    lines = []
    for entry in listing:
        link = (
            f'{indent}<li><a href="{entry.item.filename}">'
            f"{named(entry.item.name)}</a>"
        )
        if not entry.within:
            lines.append(f"{link}</li>")
            continue
        lines.append(
            f"{link}\n{indent}  <ol>\n"
            f"{links_in_the_listing(entry.within, indent + '    ', named)}\n"
            f"{indent}  </ol>\n{indent}</li>"
        )
    return "\n".join(lines)


def contents_xhtml(listing: list["Listing"]) -> str:
    items = links_in_the_listing(_of_the_story(listing), "    ", _inline)
    return (
        '<div class="contents">\n  <h1>Contents</h1>\n  <ol>\n'
        f"{items}\n  </ol>\n</div>"
    )


def _of_the_story(listing: list["Listing"]) -> list["Listing"]:
    return [
        Listing(entry.item, _of_the_story(entry.within))
        for entry in listing
        if isinstance(entry.item, (Chapter, Part))
    ]


def build_disclaimer_page(cell: DisclaimerCell) -> Page | None:
    """The page the reader turns past on the way in, headed by its own name."""
    if not cell.source.strip():
        return None
    name = cell.title or "Disclaimer"
    body = blocks_to_xhtml(cell.source.splitlines())
    return Page(
        "disclaimer",
        name,
        f'<div class="disclaimer">\n'
        f"<h{SECTION_TITLE}>{_inline(name)}</h{SECTION_TITLE}>\n{body}\n</div>",
        in_toc=True,
    )


ABOUT_TITLE = "About the Author"


def build_about_page(
    cell: AboutCell, portrait: str = "", named: str = ""
) -> Page | None:
    """The author, in their own words, and where to find them.

    Every part of it is optional, and a page with nothing written and nowhere to
    send anyone is not printed — an empty "About the Author" is worse than no
    page at all. A portrait is not one of the parts that make the page worth
    printing: it stands beside the links on a page that was already going out.
    """
    # Where the reader is sent once the story has let them go. Mirrors the editor's
    # own list, so a link added there is a link printed here.
    author_links = [
        ("Books on Amazon", cell.kdp),
        ("Website", cell.website),
        ("Substack", cell.substack),
    ]
    sent = [(label, link) for label, link in author_links if link]
    blurb = cell.source.strip()
    if not sent and not blurb:
        return None

    said = [f"  <h{SECTION_TITLE}>{ABOUT_TITLE}</h{SECTION_TITLE}>"]
    if sent or portrait:
        # The face and the list of places to go, side by side under the heading:
        # a reader looks at both at once rather than reading down them.
        said.append('  <div class="who">')
        if portrait:
            said.append(
                f'    <img class="portrait" src="{portrait}"'
                f' alt="{html.escape(named, quote=True)}"/>'
            )
        if sent:
            said.append('    <div class="links">')
            said += [
                f'      <p><a href="{html.escape(url, quote=True)}">{_inline(label)}</a></p>'
                for label, url in sent
            ]
            said.append("    </div>")
        said.append("  </div>")
    if blurb:
        said.append(blocks_to_xhtml(blurb.splitlines()))
    return Page(
        "about",
        ABOUT_TITLE,
        '<div class="about">\n' + "\n".join(said) + "\n</div>",
        in_toc=True,
    )
