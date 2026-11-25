from __future__ import annotations

import html
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from authordoc.storydoc import Document

from server.publishing.epub_items.epub_item import EpubItem
from server.publishing.epub_writer import EpubWriter

DEFAULT_LANGUAGE = "en"


@dataclass(frozen=True)
class EpubMetadata(EpubItem):

    title: str = "Anonymous"
    subtitle: str = ""
    author: str = ""
    publisher: str = ""
    date: str = ""
    version: str = ""
    isbn: str = ""
    cover_designer: str = ""
    language: str = DEFAULT_LANGUAGE
    book_id: uuid.UUID = field(default_factory=uuid.uuid4)

    @classmethod
    def create(cls, document: Document) -> 'EpubMetadata':
        return cls(
            title=document.title,
            subtitle=document.title_page.subtitle,
            author=document.title_page.author,
            publisher=document.title_page.publisher,
            date=document.title_page.date,
            version=document.title_page.version,
            isbn=document.title_page.isbn,
            cover_designer=document.title_page.cover_designer,
            language=document.title_page.language or DEFAULT_LANGUAGE,
        )

    def export(self, epub_writer: EpubWriter) -> None:
        title = html.escape(self.title)
        language = html.escape(self.language)
        modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        epub_writer.add_metadata_element(
            f'<dc:identifier id="book-id">urn:uuid:{self.book_id}</dc:identifier>'
        )
        epub_writer.add_metadata_element(f"<dc:title>{title}</dc:title>")
        epub_writer.add_metadata_element(f"<dc:language>{language}</dc:language>")
        if self.author:
            author = html.escape(self.author)
            epub_writer.add_metadata_element(f"<dc:creator>{author}</dc:creator>")
        if self.publisher:
            publisher = html.escape(self.publisher)
            epub_writer.add_metadata_element(f"<dc:publisher>{publisher}</dc:publisher>")
        if self.date:
            date = html.escape(self.date)
            epub_writer.add_metadata_element(f"<dc:date>{date}</dc:date>")
        if self.isbn:
            isbn = html.escape(self.isbn)
            epub_writer.add_metadata_element(
                f'<dc:identifier id="isbn">urn:isbn:{isbn}</dc:identifier>'
            )
        epub_writer.add_metadata_element(f'<meta property="dcterms:modified">{modified}</meta>')
