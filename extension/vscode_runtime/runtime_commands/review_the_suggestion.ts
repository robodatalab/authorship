import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ReviewTheSuggestionCommand implements AuthorDocumentCommand {
    readonly commandName = "reviewTheSuggestion";
    readonly buttonGroup = "suggestion";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const cellId = commandArguments.cellId as string;
        if (commandArguments.verdict === "accept") {
            session.acceptTheSuggestion(cellId);
        } else {
            session.rejectTheSuggestion(cellId);
        }
        await session.writeTheDocumentToItsFile();
    }
}
