import * as vscode from "vscode";

import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";

export class OpenAsTextCommand implements AuthorDocumentCommand {
    readonly name = "openAsText";
    readonly category = "view";
    readonly iconClassName = "codicon codicon-file-code";
    readonly tooltip = "View Source — open the same file as plain text";

    invoke(document: AuthorDocument): void {
        void vscode.commands.executeCommand(
            "vscode.openWith",
            document.uri,
            "default",
        );
    }
}
