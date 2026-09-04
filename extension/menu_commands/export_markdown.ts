import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "../author_editor/author_document_command";
import { toMarkdown } from "../markdown/exporter";
import { AuthorDocument } from "../storydoc/model";

/** `story.author` is exported beside itself as `story.md`. */
function markdownBeside(document: vscode.Uri): vscode.Uri {
    return document.with({
        path: document.path.replace(/\.author$/i, "") + ".md",
    });
}

export class ExportMarkdownCommand implements AuthorDocumentCommand {
    readonly category = "transfer";
    readonly iconClassName = "aicon aicon-export-markdown";
    readonly tooltip =
        "Export Markdown — write this document out as one plain markdown manuscript";

    constructor(private readonly document: vscode.Uri) {}

    invoke = async (): Promise<void> => {
        const bytes = await vscode.workspace.fs.readFile(this.document);
        const manuscript = markdownBeside(this.document);
        await vscode.workspace.fs.writeFile(
            manuscript,
            new TextEncoder().encode(
                toMarkdown(
                    AuthorDocument.fromText(new TextDecoder().decode(bytes))
                        .cells,
                ),
            ),
        );
        void vscode.window.showInformationMessage(
            `Exported ${vscode.workspace.asRelativePath(this.document)} to ${vscode.workspace.asRelativePath(manuscript)}`,
        );
    };
}
