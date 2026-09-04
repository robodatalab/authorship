import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveCellUpCommand implements AuthorDocumentCommand {
    readonly name = "moveCellUp";
    readonly category = "cell";
    readonly iconClassName = "codicon codicon-chevron-up";
    readonly tooltip = "Move up";

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        const at = payload.at as number;
        document.moveAt(at, at - 1);
    }
}
