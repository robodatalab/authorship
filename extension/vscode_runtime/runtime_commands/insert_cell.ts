import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import { cellOfKind } from "authordoc/parser";

export class InsertCellCommand implements AuthorDocumentCommand {
    readonly commandName = "insertCell";
    readonly buttonGroup = "insert";
    readonly iconClassName = "codicon codicon-add";
    readonly tooltip = "Add a section here";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const blankCell = cellOfKind(commandArguments.cellKind as string);
        const beforeCellId = commandArguments.beforeCellId as string | null;
        session.changeTheDocument((story) => {
            const cells = [...story.cells];
            const beforeCellIndex = cells.findIndex(
                (cell) => cell.uniqueId === beforeCellId,
            );
            const insertedAt =
                beforeCellIndex === -1 ? cells.length : beforeCellIndex;
            cells.splice(insertedAt, 0, blankCell);
            const storyWithTheCell = story.withCells(cells);
            return storyWithTheCell;
        });
    }
}
