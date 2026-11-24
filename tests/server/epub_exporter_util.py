from authordoc.storydoc import Document

from server.publishing.document_to_epub_content_converter import read_book
from server.publishing.epub_content import Chapter


def chapters_of(document: Document) -> list[Chapter]:
    """A chapter per chapter cell, carrying the prose written under it."""
    return read_book(document).chapters
