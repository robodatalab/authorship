from __future__ import annotations

import html
import re

# The heading a page carries its own name in. A heading the author wrote into the
# prose stands under it, however few hashes they gave it, so nothing inside a
# section is set louder than the section is.
SECTION_TITLE = 2

_BOLD_ITALIC = re.compile(r"\*\*\*(.+?)\*\*\*")
_BOLD = re.compile(r"\*\*(.+?)\*\*")
_BOLD_UND = re.compile(r"(?<!\w)__(?!_)(.+?)(?<!_)__(?!\w)")
_ITALIC_STAR = re.compile(r"(?<!\*)\*(?!\*)(\S(?:[^*]*?\S)?)(?<!\*)\*(?!\*)")
_ITALIC_UND = re.compile(r"(?<!\w)_(?!_)(\S(?:[^_]*?\S)?)(?<!_)_(?!\w)")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_HEADING = re.compile(r"(#{1,3})\s+(.*)")
_IMAGE = re.compile(r"!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)")


def _inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = _BOLD_ITALIC.sub(r"<strong><em>\1</em></strong>", text)
    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _BOLD_UND.sub(r"<strong>\1</strong>", text)
    text = _ITALIC_STAR.sub(r"<em>\1</em>", text)
    text = _ITALIC_UND.sub(r"<em>\1</em>", text)
    text = _LINK.sub(
        lambda m: f'<a href="{html.escape(m.group(2), quote=True)}">{m.group(1)}</a>',
        text,
    )
    return text


def blocks_to_xhtml(lines: list[str]) -> str:
    out: list[str] = []
    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            continue
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            out.append('<hr class="scene-break"/>')
        elif picture := _IMAGE.fullmatch(stripped):
            alt, src = picture.groups()
            out.append(
                f'<p class="image"><img src="{html.escape(src, quote=True)}"'
                f' alt="{html.escape(alt, quote=True)}"/></p>'
            )
        elif heading := _HEADING.fullmatch(stripped):
            hashes, said = heading.groups()
            level = SECTION_TITLE + len(hashes)
            out.append(f"<h{level}>{_inline(said.strip())}</h{level}>")
        else:
            out.append(f"<p>{_inline(stripped)}</p>")
    return "\n".join(out)
