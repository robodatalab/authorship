import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { toMarkdown } from "../markdown/exporter";
import type { AuthorDocument } from "../storydoc/model";

/** `story.author` is exported beside itself as `story.md`. */
function markdownBeside(document: vscode.Uri): vscode.Uri {
    return document.with({
        path: document.path.replace(/\.author$/i, "") + ".md",
    });
}

export class ExportMarkdownCommand implements AuthorDocumentCommand {
    readonly name = "exportMarkdown";
    readonly category = "transfer";
    readonly iconClassName = "aicon aicon-export-markdown";
    readonly tooltip =
        "Export Markdown — write this document out as one plain markdown manuscript";

    async invoke(document: AuthorDocument): Promise<void> {
        const manuscript = markdownBeside(document.uri);
        await vscode.workspace.fs.writeFile(
            manuscript,
            new TextEncoder().encode(toMarkdown(document.cells)),
        );
        void vscode.window.showInformationMessage(
            `Exported ${vscode.workspace.asRelativePath(document.uri)} to ${vscode.workspace.asRelativePath(manuscript)}`,
        );
    }
}
