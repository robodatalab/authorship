import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveCellDownCommand implements AuthorDocumentCommand {
    readonly name = "moveCellDown";
    readonly category = "cell";
    readonly iconClassName = "codicon codicon-chevron-down";
    readonly tooltip = "Move down";

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        const at = payload.at as number;
        document.moveAt(at, at + 1);
    }
}
