from authordoc.storydoc import Document

from server.publishing.document_to_epub_content_converter import read_book
from server.publishing import epub_items


def chapters_of(document: Document) -> list[epub_items.EpubChapter]:
    """A chapter per chapter cell, carrying the prose written under it."""
    items_in_export_order = read_book(document)
    return [item for item in items_in_export_order if isinstance(item, epub_items.EpubChapter)]
