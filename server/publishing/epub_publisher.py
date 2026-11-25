"""Exporter of Documents to epub format"""

from __future__ import annotations

import zipfile
from pathlib import Path

from authordoc.storydoc import Document

from server.publishing.document_to_epub_content_converter import read_book
from server.publishing.epub_writer import EpubWriter


def build_epub(document: Document, out_path: Path) -> None:
    """Write the document as an EPUB, dressed in what the document says about it."""
    epub_document = read_book(document)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as epub_file:
        epub_writer = EpubWriter(epub_file)
        epub_document.export(epub_writer)
        epub_writer.write_package_document()
