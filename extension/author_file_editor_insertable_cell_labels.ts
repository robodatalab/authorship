import { AuthorDocumentCommand } from "./author_editor/author_document_command";
import { MarkdownCell } from "./cell_types/MarkdownCell";

class CellInsertCommand implements AuthorDocumentCommand {
    readonly category: string;
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip: string;

    constructor(tooltip: string, category: string) {
        this.tooltip = tooltip;
        this.category = category;
    }

    invoke = () => {
        // TODO: do stuff to modify the document and insert the cell in a proper place
    };
}

export const AUTHOR_FILE_EDITOR_INSERTABLE_CELL_LABELS = [
    new CellInsertCommand("Markdown", "primary"),
];
