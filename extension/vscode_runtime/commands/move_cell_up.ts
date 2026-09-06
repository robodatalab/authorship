import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveCellUpCommand implements AuthorDocumentCommand {
    readonly commandName = "moveCellUp";
    readonly buttonGroup = "cell";
    readonly iconClassName = "codicon codicon-chevron-up";
    readonly tooltip = "Move up";

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        const at = commandArguments.cellIndex as number;
        document.moveAt(at, at - 1);
    }
}
