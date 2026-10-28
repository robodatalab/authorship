import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { parse } from "authordoc/parser";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReplaceCellCommand implements AuthorDocumentCommand {
    readonly commandName = "replaceCell";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const written = commandArguments.cell as string;
        const [cellReplacing] = parse(written);
        session.changeTheDocument((story) => {
            const cellIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === cellReplacing.uniqueId,
            );
            if (cellIndex === -1) {
                return;
            }
            story.cells[cellIndex] = cellReplacing;
        });
    }
}
