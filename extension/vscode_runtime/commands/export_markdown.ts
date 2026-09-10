import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { toMarkdown } from "../markdown/exporter";
import type { ImmutableAuthorDocument } from "../storydoc/model";

function markdownFileBeside(authorFile: vscode.Uri): vscode.Uri {
    return authorFile.with({
        path: authorFile.path.replace(/\.author$/i, "") + ".md",
    });
}

export class ExportMarkdownCommand implements AuthorDocumentCommand {
    readonly commandName = "exportMarkdown";
    readonly buttonGroup = "transfer";
    readonly iconClassName = "aicon aicon-export-markdown";
    readonly tooltip =
        "Export Markdown — write this session.document out as one plain markdown manuscript";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        const manuscript = markdownFileBeside(session.document.uri);
        await vscode.workspace.fs.writeFile(
            manuscript,
            new TextEncoder().encode(toMarkdown(session.document.cells)),
        );
        void vscode.window.showInformationMessage(
            `Exported ${vscode.workspace.asRelativePath(session.document.uri)} to ${vscode.workspace.asRelativePath(manuscript)}`,
        );
    }
}
