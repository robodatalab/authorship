from __future__ import annotations

from dataclasses import dataclass

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_writer import EpubWriter

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


@dataclass
class EpubStylesheet(EpubItem):
    def export(self, epub_writer: EpubWriter) -> None:
        epub_writer.write_file("OEBPS/style.css", CSS)
        epub_writer.add_manifest_item("css", "style.css", "text/css")
