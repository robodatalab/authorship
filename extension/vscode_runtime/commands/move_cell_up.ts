import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { moveTheSectionUp } from "authordoc/story_sections";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveCellUpCommand implements AuthorDocumentCommand {
    readonly commandName = "moveCellUp";
    readonly buttonGroup = "cell";
    readonly iconClassName = "codicon codicon-chevron-up";
    readonly tooltip = "Move up";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) =>
            moveTheSectionUp(story, commandArguments.cellId as string),
        );
    }
}
