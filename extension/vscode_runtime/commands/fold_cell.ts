import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class FoldCellCommand implements AuthorDocumentCommand {
    readonly name = "foldCell";
    readonly category = "cell";
    readonly iconClassName = "codicon codicon-fold-up";
    readonly tooltip = "Fold this section away, or open it again";

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        const cell = document.cells[payload.at as number];
        cell?.fold(!cell.isFolded());
    }
}
