import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "../../webview/author_editor/author_document_command";
import { fromMarkdown } from "../markdown/exporter";

export class ImportMarkdownCommand implements AuthorDocumentCommand {
    readonly category = "transfer";
    readonly iconClassName = "aicon aicon-import-markdown";
    readonly tooltip =
        "Import Markdown — replace this document with an existing markdown manuscript";

    constructor(private readonly document: vscode.Uri) {}

    /**
     * Replace the document with an existing markdown manuscript.
     *
     * This throws away what is here, so it asks first — and it asks with the
     * file's name in the question, because "are you sure" answers nothing.
     */
    invoke = async (): Promise<void> => {
        const picked = await vscode.window.showOpenDialog({
            title: "Import Markdown",
            openLabel: "Import",
            // Opened where the story lives, so the manuscript is usually already
            // on screen rather than several folders away.
            defaultUri: vscode.Uri.joinPath(this.document, ".."),
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            // `All Files` last, as a way out: a filter is a convenience, and a
            // manuscript saved under some other extension should still be openable.
            filters: {
                Markdown: ["md", "markdown", "mdown", "txt"],
                "All Files": ["*"],
            },
        });
        if (!picked || picked.length === 0) {
            return;
        }
        const manuscript = picked[0];
        const confirmed = await vscode.window.showWarningMessage(
            `Replace everything in ${vscode.workspace.asRelativePath(this.document)} with ${vscode.workspace.asRelativePath(manuscript)}?`,
            { modal: true },
            "Replace",
        );
        if (confirmed !== "Replace") {
            return;
        }
        const bytes = await vscode.workspace.fs.readFile(manuscript);
        await vscode.workspace.fs.writeFile(
            this.document,
            new TextEncoder().encode(
                fromMarkdown(new TextDecoder().decode(bytes)),
            ),
        );
        void vscode.window.showInformationMessage(
            `Imported ${vscode.workspace.asRelativePath(manuscript)} into ${vscode.workspace.asRelativePath(this.document)}`,
        );
    };
}
