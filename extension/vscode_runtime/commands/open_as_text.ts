import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { ImmutableAuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class OpenAsTextCommand implements AuthorDocumentCommand {
    readonly commandName = "openAsText";
    readonly buttonGroup = "view";
    readonly iconClassName = "codicon codicon-file-code";
    readonly tooltip = "View Source — open the same file as plain text";

    invoke(session: AuthorFileEditorSession): void {
        void vscode.commands.executeCommand(
            "vscode.openWith",
            session.document.uri,
            "default",
        );
    }
}
