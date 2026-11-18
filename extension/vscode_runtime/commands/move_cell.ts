import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { moveTheSection } from "authordoc/story_sections";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveCellCommand implements AuthorDocumentCommand {
    readonly commandName = "moveCell";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const cellId = commandArguments.cellId as string;
        const beforeCellId = commandArguments.beforeCellId as string | null;
        session.changeTheDocument((story) =>
            moveTheSection(story, cellId, beforeCellId),
        );
    }
}
