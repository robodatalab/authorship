from __future__ import annotations

import html
import zipfile

XHTML_DOC = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}" lang="{lang}">
<head>
  <meta charset="utf-8"/>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
{body}
</body>
</html>
"""


def page_filename(page_id: str) -> str:
    return f"{page_id}.xhtml"


class EpubWriter:
    def __init__(self, epub_file: zipfile.ZipFile) -> None:
        self._epub_file = epub_file
        self._metadata_elements: list[str] = []
        self._manifest_entries: list[str] = []
        self._spine_entries: list[str] = []

    def write_file(self, path: str, content: str | bytes, compress_type: int | None = None) -> None:
        self._epub_file.writestr(path, content, compress_type=compress_type)

    def write_page(self, page_id: str, title: str, language: str, body_xhtml: str) -> None:
        filename = page_filename(page_id)
        escaped_title = html.escape(title)
        page_xhtml = XHTML_DOC.format(lang=language, title=escaped_title, body=body_xhtml)
        self.write_file(f"OEBPS/{filename}", page_xhtml)
        self.add_manifest_item(page_id, filename, "application/xhtml+xml")
        self.add_spine_item(page_id)

    def add_metadata_element(self, element: str) -> None:
        self._metadata_elements.append(element)

    def add_manifest_item(self, item_id: str, href: str, media_type: str, properties: str = "") -> None:
        properties_attribute = f' properties="{properties}"' if properties else ""
        manifest_entry = f'<item id="{item_id}" href="{href}" media-type="{media_type}"{properties_attribute}/>'
        self._manifest_entries.append(manifest_entry)

    def add_spine_item(self, item_id: str) -> None:
        spine_entry = f'<itemref idref="{item_id}"/>'
        self._spine_entries.append(spine_entry)

    def write_package_document(self) -> None:
        indent = "\n    "
        metadata_xml = indent.join(self._metadata_elements)
        manifest_xml = indent.join(self._manifest_entries)
        spine_xml = indent.join(self._spine_entries)
        content_opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    {metadata_xml}
  </metadata>
  <manifest>
    {manifest_xml}
  </manifest>
  <spine toc="ncx">
    {spine_xml}
  </spine>
</package>
"""
        self._epub_file.writestr("OEBPS/content.opf", content_opf)
