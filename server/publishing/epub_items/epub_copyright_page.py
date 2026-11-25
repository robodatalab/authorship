from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from server.publishing.epub_items.epub_metadata import EpubMetadata
from server.publishing.epub_items.epub_page import EpubPage
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


@dataclass
class EpubCopyrightPage(EpubPage):
    """Who owns the book, what may be done with it, and which edition it is.

    Built from the title page rather than written by the author: every fact on it
    is one the title page already carries, and a copyright page that disagreed
    with the title page would be the one thing worse than not having one.
    """

    @classmethod
    def create(cls, metadata: EpubMetadata) -> EpubCopyrightPage:
        copyright_page = cls("copyright", metadata)
        return copyright_page

    @property
    def name(self) -> str:
        return COPYRIGHT_TITLE

    @property
    def body_xhtml(self) -> str:
        metadata = self.metadata
        year = copyright_year(metadata.date)
        rights_holders = " and ".join(
            who for who in (metadata.author, metadata.publisher) if who
        )
        copyright_line = f"Copyright © {year} {rights_holders}".strip()
        copyright_lines = [
            f"  <p>{_inline(copyright_line)}. All rights reserved.</p>",
            f"  <p>{RIGHTS}</p>",
        ]
        if metadata.author:
            moral_rights = MORAL_RIGHTS.format(named=rights_holders)
            copyright_lines.append(f"  <p>{_inline(moral_rights)}</p>")
        if metadata.cover_designer:
            copyright_lines.append(f"  <p>Cover design by {_inline(metadata.cover_designer)}</p>")
        if metadata.publisher:
            copyright_lines.append(f"  <p>Published by {_inline(metadata.publisher)}</p>")

        edition = []
        if metadata.version:
            edition.append(f"Version {metadata.version}")
        if metadata.date:
            edition.append(metadata.date)
        if edition:
            edition_line = " · ".join(edition)
            copyright_lines.append(f"  <p>{_inline(edition_line)}</p>")
        if metadata.isbn:
            copyright_lines.append(f"  <p>ISBN {_inline(metadata.isbn)}</p>")
        joined_lines = "\n".join(copyright_lines)
        return f'<div class="copyright">\n{joined_lines}\n</div>'
