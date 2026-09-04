import { Cell, type AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class InsertCellCommand implements AuthorDocumentCommand {
    readonly name = "insertCell";
    readonly category = "insert";
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip = "Add a section here";

    invoke(document: AuthorDocument, payload: Record<string, unknown>): void {
        const added = payload.cell as {
            kind: string;
            source: string;
            attrs: Record<string, string>;
        };
        document.insertAt(
            payload.at as number,
            new Cell(added.kind, added.source, added.attrs),
        );
    }
}
