import type { AuthorFileEditorSession } from "../author_file_editor_session";
import type { AuthorDocumentCommand } from "./author_document_command";

export class ToggleStoryPlotsCommand implements AuthorDocumentCommand {
    readonly commandName = "toggleStoryPlots";
    readonly buttonGroup = "analysis";
    readonly iconClassName = "codicon codicon-layers";
    readonly tooltip = "Show or hide the plots the story weaves";

    invoke(session: AuthorFileEditorSession): void {
        session.toggleStoryPlots();
    }
}
