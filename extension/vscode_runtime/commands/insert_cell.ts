import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { Cell } from "../storydoc/storydoc";
import type { AuthorDocumentCommand } from "./author_document_command";

export class InsertCellCommand implements AuthorDocumentCommand {
    readonly commandName = "insertCell";
    readonly buttonGroup = "insert";
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip = "Add a section here";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const blankCell = Cell.ofKind(commandArguments.cellKind as string);
        const beforeCellId = commandArguments.beforeCellId as string | null;
        session.changeTheDocument((story) => {
            const beforeCellIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === beforeCellId,
            );
            const insertedAt =
                beforeCellIndex === -1 ? story.cells.length : beforeCellIndex;
            story.cells.splice(insertedAt, 0, blankCell);
        });
    }
}
