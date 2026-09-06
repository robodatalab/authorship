import { Cell, type AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class InsertCellCommand implements AuthorDocumentCommand {
    readonly commandName = "insertCell";
    readonly buttonGroup = "insert";
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip = "Add a section here";

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        const newCell = commandArguments.newCell as {
            kind: string;
            source: string;
            attrs: Record<string, string>;
        };
        document.insertAt(
            commandArguments.cellIndex as number,
            new Cell(newCell.kind, newCell.source, newCell.attrs),
        );
    }
}
