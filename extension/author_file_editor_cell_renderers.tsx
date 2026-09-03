import type { AuthorDocumentCellEditCommand } from "./author_editor/author_document_cell_edit_command";
import type { AuthorDocumentCellRenderers } from "./author_editor/author_document_cell_renderers";
import { MarkdownCell } from "./cell_types/MarkdownCell";
import { MARKDOWN } from "./storydoc/model";
import type { AuthorDocument } from "./storydoc/model";

class CellMarkdownEditCommand implements AuthorDocumentCellEditCommand {
    constructor(
        private readonly authorDocument: AuthorDocument,
        private readonly cellIndex: number,
    ) {}

    invoke = (editedMarkdown: string) => {
        this.authorDocument.replaceCellMarkdown(this.cellIndex, editedMarkdown);
    };
}

export function authorFileEditorCellRenderers(
    authorDocument: AuthorDocument,
): AuthorDocumentCellRenderers {
    return {
        [MARKDOWN]: (document, cellIndex) => (
            <MarkdownCell
                markdown={document.cells[cellIndex].source}
                editCommand={
                    new CellMarkdownEditCommand(authorDocument, cellIndex)
                }
            />
        ),
    };
}
