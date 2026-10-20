import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";
import type { ProseCheckError } from "./check_prose";

export class FixProseCommand implements AuthorDocumentCommand {
    readonly commandName = "fixProse";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const error = commandArguments as unknown as ProseCheckError;
        session.changeTheDocument((story) => {
            const cellIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === error.cellId,
            );
            if (cellIndex === -1 || error.correctVersion === "") {
                return;
            }
            const cell = story.cells[cellIndex];
            story.cells[cellIndex] = cell.withSource(
                cell.source.slice(0, error.startCharacterOffsetInCell) +
                    error.correctVersion +
                    cell.source.slice(error.endCharacterOffsetInCell),
            );
        });
    }
}
