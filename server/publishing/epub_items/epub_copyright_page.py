from __future__ import annotations

import re
from datetime import datetime, timezone

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_writer import EpubWriter
from server.publishing.markdown_to_xhtml_converter import _inline

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


class EpubCopyrightPage(EpubItem):
    def __init__(self, id: str, author: str, publisher: str, date: str, version: str, isbn: str, cover_designer: str, language: str) -> None:
        self.id = id
        self.author = author
        self.publisher = publisher
        self.date = date
        self.version = version
        self.isbn = isbn
        self.cover_designer = cover_designer
        self.language = language

    @classmethod
    def create(cls, metadata: EpubMetadata) -> EpubCopyrightPage:
        copyright_page = cls(
            "copyright",
            metadata.author,
            metadata.publisher,
            metadata.date,
            metadata.version,
            metadata.isbn,
            metadata.cover_designer,
            metadata.language,
        )
        return copyright_page

    def export(self, epub_writer: EpubWriter) -> None:
        year = copyright_year(self.date)
        rights_holders = " and ".join(
            who for who in (self.author, self.publisher) if who
        )
        copyright_line = f"Copyright © {year} {rights_holders}".strip()
        copyright_lines = [
            f"  <p>{_inline(copyright_line)}. All rights reserved.</p>",
            f"  <p>{RIGHTS}</p>",
        ]
        if self.author:
            moral_rights = MORAL_RIGHTS.format(named=rights_holders)
            copyright_lines.append(f"  <p>{_inline(moral_rights)}</p>")
        if self.cover_designer:
            copyright_lines.append(f"  <p>Cover design by {_inline(self.cover_designer)}</p>")
        if self.publisher:
            copyright_lines.append(f"  <p>Published by {_inline(self.publisher)}</p>")

        edition = []
        if self.version:
            edition.append(f"Version {self.version}")
        if self.date:
            edition.append(self.date)
        if edition:
            edition_line = " · ".join(edition)
            copyright_lines.append(f"  <p>{_inline(edition_line)}</p>")
        if self.isbn:
            copyright_lines.append(f"  <p>ISBN {_inline(self.isbn)}</p>")
        joined_lines = "\n".join(copyright_lines)
        body_xhtml = f'<div class="copyright">\n{joined_lines}\n</div>'
        epub_writer.write_page(self.id, COPYRIGHT_TITLE, self.language, body_xhtml)
