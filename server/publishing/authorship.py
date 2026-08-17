"""What a book carries besides its story.

The manuscript is the book: its `# ` line names it, its `##` lines name the
chapters, and its prose is the story. Nothing here repeats any of that.

What is left is what publishing needs and the story never says — who is credited,
who prints it, what the cover shows, what the copyright page carries. That is
also mostly prose, so it is kept the same way, in `<name>.authorship.md` beside
the manuscript.

The division is worth stating plainly, because the author has to know which file
to open: **if the reader meets it inside the story, it is in the manuscript; if
they meet it on the way in or on the way out, it is here.** A subtitle is here,
because a manuscript has no line for one. A title is not, because a manuscript
already opens with it.

A `##` heading names one thing the book needs and what stands beneath it is that
thing. The author edits the file directly; nothing writes it back, so a heading
this module does not know is left alone rather than lost, and the order the
author put the headings in is theirs to choose.

Notes are written as `<!-- -->` and are not part of what they stand under, which
is the same bargain the manuscript strikes with the author's own notes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_LANGUAGE = "en"
DEFAULT_WORDS_PER_PART = 5000

_HEADING = re.compile(r"^##\s+(.*?)\s*$")
_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_IMAGE = re.compile(r"!\[[^\]]*\]\(\s*([^)\s]+)")
_LINK = re.compile(r"\[([^\]]*)\]\(\s*([^)\s]+)")
_URL = re.compile(r"https?://\S+")


@dataclass(frozen=True)
class Link:
    """Somewhere the reader is sent, under the words that send them."""

    label: str
    url: str


@dataclass(frozen=True)
class Authorship:
    # No title: the manuscript's `# ` line is the book's name, and a second place
    # to write it is a second answer to the same question.
    subtitle: str = ""
    author: str = ""
    publisher: str = ""
    language: str = DEFAULT_LANGUAGE
    cover: str = ""
    blurb: str = ""
    disclaimer: str = ""
    kindle: Link | None = None
    author_page: Link | None = None
    words_per_part: int = DEFAULT_WORDS_PER_PART


def sections_of(text: str) -> dict[str, str]:
    """What stands under each `##`, by the heading that names it.

    A heading with nothing under it is present and empty, which is what a
    template that has not been filled in yet looks like.
    """
    sections: dict[str, list[str]] = {}
    under: list[str] | None = None
    for line in _COMMENT.sub("", text).splitlines():
        heading = _HEADING.match(line)
        if heading:
            under = sections.setdefault(heading.group(1).casefold(), [])
        elif under is not None:
            under.append(line)
    return {name: "\n".join(body).strip() for name, body in sections.items()}


def read(text: str) -> Authorship:
    said = sections_of(text)

    def one_line(name: str, fallback: str = "") -> str:
        # A field the author wrote across two lines still names one thing.
        return " ".join(said.get(name, "").split()) or fallback

    return Authorship(
        subtitle=one_line("subtitle"),
        author=one_line("author"),
        publisher=one_line("publisher"),
        language=one_line("language", DEFAULT_LANGUAGE),
        cover=_first_image(said.get("cover", "")),
        blurb=said.get("blurb", ""),
        disclaimer=said.get("disclaimer", ""),
        kindle=_first_link(said.get("kindle page", "")),
        author_page=_first_link(said.get("author page", "")),
        words_per_part=_first_number(
            said.get("words per part", ""), DEFAULT_WORDS_PER_PART
        ),
    )


def load(path: Path) -> Authorship:
    """The authorship beside a manuscript, or the defaults where none is written."""
    try:
        return read(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return Authorship()


def path_beside(manuscript: Path) -> Path:
    stem = re.sub(r"\.md$", "", manuscript.name, flags=re.I)
    return manuscript.with_name(stem + ".authorship.md")


def _first_image(body: str) -> str:
    found = _IMAGE.search(body)
    return found.group(1) if found else ""


def _first_link(body: str) -> Link | None:
    """`[label](url)` names the link; a bare URL is its own label."""
    linked = _LINK.search(body)
    if linked:
        return Link(linked.group(1).strip(), linked.group(2))
    bare = _URL.search(body)
    return Link(bare.group(0), bare.group(0)) if bare else None


def _first_number(body: str, fallback: int) -> int:
    found = re.search(r"\d+", body)
    if not found:
        return fallback
    return int(found.group(0)) or fallback


TEMPLATE = """\
# Authorship

<!--
What your book needs that the story does not say.

Two files, and the split is firm:

  the manuscript   the title (its `# ` line), the chapters (its `##` lines),
                   the prose, your notes
  this file        everything the reader meets on the way in or on the way out —
                   who is credited, who publishes it, the cover, the blurb, the
                   copyright page, where to find you

So the book is renamed in the manuscript, never here. Everything else is here.

A `##` heading names one thing, and what you write under it is that thing. Notes
like this one are ignored, so a heading you leave untouched simply goes unused.
-->

## Subtitle

<!-- The manuscript has no line for one, so it belongs here. -->

## Author

## Publisher

## Language

en

## Cover

<!--
A markdown image, its path relative to this file. Uncomment and point it at
yours:

![cover](cover.jpg)
-->

## Blurb

<!-- Back-cover copy. Travels with the book as its description. -->

## Disclaimer

<!--
Printed on its own page after the title: the copyright line, the
any-resemblance-to-real-persons notice, whatever this book needs.
-->

## Kindle Page

<!-- [Buy on Kindle](https://www.amazon.com/dp/XXXXXXXXXX) -->

## Author Page

<!-- [My website](https://example.com) -->

## Words per Part

5000
"""
