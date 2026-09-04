import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class DeleteCellCommand implements AuthorDocumentCommand {
    readonly name = "deleteCell";
    readonly category = "cell";
    readonly iconClassName = "codicon codicon-trash";
    readonly tooltip = "Delete this section";

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        document.removeAt(payload.at as number);
    }
}
