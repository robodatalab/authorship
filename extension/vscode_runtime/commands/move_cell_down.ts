import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { ImmutableAuthorDocument } from "../storydoc/model";
import { moveTheSectionDown } from "../storydoc/sections";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveCellDownCommand implements AuthorDocumentCommand {
    readonly commandName = "moveCellDown";
    readonly buttonGroup = "cell";
    readonly iconClassName = "codicon codicon-chevron-down";
    readonly tooltip = "Move down";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        session.changeTheDocument((story) =>
            moveTheSectionDown(story, commandArguments.cellId as string),
        );
    }
}
