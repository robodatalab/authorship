"""Redraw the `authorship-export-parts` glyph in media/authorship-icons.woff.

The font is a binary asset with no source, which is how a small change to one
glyph turns into an afternoon of reading coordinates back out of it. This is that
reading, written down.

Only the parts glyph is drawn here; the other three are left exactly as they are.

    .venv/bin/python media/icons.py

The canvas is 300 units to the em, to match the codicon font the rest of the
toolbar is drawn in. Outer contours run counter-clockwise and inner ones
clockwise, which is what makes a square a frame rather than a block — the same
convention the badge in the other glyphs already uses.
"""

from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

FONT = Path(__file__).with_name("authorship-icons.woff")
GLYPH = "authorship-export-parts"

# One document cut into several: two parts beside each other and a third below,
# which is what says "more than a pair" without drawing a fourth.
MARGIN = 12
SIDE = 128
GAP = 20

# The stem width of the M and the D in the sibling glyphs. What "one line" is in
# this family; a square drawn any lighter reads as a different set of icons.
STROKE = 18

LEFT = MARGIN
RIGHT = MARGIN + SIDE + GAP
BOTTOM = MARGIN
TOP = MARGIN + SIDE + GAP

SQUARES = [
    (LEFT, TOP),
    (RIGHT, TOP),
    (LEFT, BOTTOM),
]


def frame(pen: TTGlyphPen, x: int, y: int) -> None:
    """A square outline: the edge, then the hole it encloses."""
    far_x, far_y = x + SIDE, y + SIDE
    for corners in [
        [(x, y), (far_x, y), (far_x, far_y), (x, far_y)],
        [
            (x + STROKE, y + STROKE),
            (x + STROKE, far_y - STROKE),
            (far_x - STROKE, far_y - STROKE),
            (far_x - STROKE, y + STROKE),
        ],
    ]:
        pen.moveTo(corners[0])
        for corner in corners[1:]:
            pen.lineTo(corner)
        pen.closePath()


def main() -> None:
    font = TTFont(FONT)
    pen = TTGlyphPen(None)
    for x, y in SQUARES:
        frame(pen, x, y)

    glyf = font["glyf"]
    glyf[GLYPH] = pen.glyph()
    glyf[GLYPH].recalcBounds(glyf)
    font["hmtx"][GLYPH] = (300, 0)
    font.flavor = "woff"
    font.save(FONT)
    print(f"Redrew {GLYPH} in {FONT}")


if __name__ == "__main__":
    main()
