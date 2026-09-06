import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class DeleteCellCommand implements AuthorDocumentCommand {
    readonly commandName = "deleteCell";
    readonly buttonGroup = "cell";
    readonly iconClassName = "codicon codicon-trash";
    readonly tooltip = "Delete this section";

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        document.removeAt(commandArguments.cellIndex as number);
    }
}
