from __future__ import annotations

import zipfile


class EpubWriter:
    def __init__(self, epub_file: zipfile.ZipFile) -> None:
        self._epub_file = epub_file
        self._metadata_elements: list[str] = []
        self._manifest_entries: list[str] = []
        self._spine_entries: list[str] = []

    def write_file(self, path: str, content: str | bytes, compress_type: int | None = None) -> None:
        self._epub_file.writestr(path, content, compress_type=compress_type)

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
