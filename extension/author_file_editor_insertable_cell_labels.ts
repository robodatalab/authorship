import { AuthorDocumentCommand } from "./author_editor/author_document_command";
import type { AuthorDocumentHostChannel } from "./author_editor/author_document_host_channel";
import { MarkdownCell } from "./cell_types/MarkdownCell";

class CellInsertCommand implements AuthorDocumentCommand {
    readonly category: string;
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip: string;
    private readonly hostChannel: AuthorDocumentHostChannel;

    constructor(
        hostChannel: AuthorDocumentHostChannel,
        tooltip: string,
        category: string,
    ) {
        this.hostChannel = hostChannel;
        this.tooltip = tooltip;
        this.category = category;
    }

    invoke = () => {
        // TODO: do stuff to modify the document and insert the cell in a proper place
    };
}

export function authorFileEditorCellInsertCommands(
    hostChannel: AuthorDocumentHostChannel,
): AuthorDocumentCommand[] {
    return [new CellInsertCommand(hostChannel, "Markdown", "primary")];
}
