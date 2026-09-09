import { blankCellOfKind } from "../storydoc/cell_kinds";
import type { AuthorDocument } from "../storydoc/model";
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
        document.insertBefore(
            (commandArguments.beforeCellId as string | null) ?? null,
            blankCellOfKind(commandArguments.cellKind as string),
        );
    }
}
