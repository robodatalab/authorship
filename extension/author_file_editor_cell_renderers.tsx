import type { AuthorDocumentCellRenderers } from "./author_editor/author_document_cell_renderers";
import { MarkdownCell } from "./cell_types/MarkdownCell";
import { MARKDOWN } from "./storydoc/model";

export const AUTHOR_FILE_EDITOR_CELL_RENDERERS: AuthorDocumentCellRenderers = {
    [MARKDOWN]: (cell) => <MarkdownCell markdown={cell.source} />,
};
