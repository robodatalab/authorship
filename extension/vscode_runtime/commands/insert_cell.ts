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
        document.insertAfter(
            (commandArguments.afterCellId as string | null) ?? null,
            new Cell(newCell.kind, newCell.source, newCell.attrs),
        );
    }
}
