import type { AuthorDocument } from "../storydoc/model";
import { moveTheSectionDown } from "../storydoc/sections";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveCellDownCommand implements AuthorDocumentCommand {
    readonly commandName = "moveCellDown";
    readonly buttonGroup = "cell";
    readonly iconClassName = "codicon codicon-chevron-down";
    readonly tooltip = "Move down";

    invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): void {
        moveTheSectionDown(document, commandArguments.cellId as string);
    }
}
