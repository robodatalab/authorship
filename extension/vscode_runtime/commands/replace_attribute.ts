import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { Cell, type Document } from "../storydoc/storydoc";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReplaceAttributeCommand implements AuthorDocumentCommand {
    readonly commandName = "replaceAttribute";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const cellId = commandArguments.cellId as string;
        const attributeName = commandArguments.attributeName as string;
        const attributeValue = commandArguments.attributeValue as string;
        session.changeTheDocument((story) => {
            const cellIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === cellId,
            );
            if (cellIndex === -1) {
                return;
            }
            const cell = story.cells[cellIndex];
            const attributes = {
                ...cell.attrs,
                [attributeName]: attributeValue,
            };
            story.cells[cellIndex] = new Cell(
                cell.kind,
                cell.source,
                attributes,
                cell.at,
                cell.uniqueId,
            );
        });
    }
}
