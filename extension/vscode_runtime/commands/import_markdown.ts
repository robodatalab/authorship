import * as vscode from "vscode";

import type { AuthorDocument } from "../storydoc/model";
import type { AuthorDocumentCommand } from "./author_document_command";
import { fromMarkdown } from "../markdown/exporter";

export class ImportMarkdownCommand implements AuthorDocumentCommand {
    readonly commandName = "importMarkdown";
    readonly buttonGroup = "transfer";
    readonly iconClassName = "aicon aicon-import-markdown";
    readonly tooltip =
        "Import Markdown — replace this document with an existing markdown manuscript";

    async invoke(document: AuthorDocument): Promise<void> {
        const picked = await vscode.window.showOpenDialog({
            title: "Import Markdown",
            openLabel: "Import",
            defaultUri: vscode.Uri.joinPath(document.uri, ".."),
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
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
            `Replace everything in ${vscode.workspace.asRelativePath(document.uri)} with ${vscode.workspace.asRelativePath(manuscript)}?`,
            { modal: true },
            "Replace",
        );
        if (confirmed !== "Replace") {
            return;
        }
        const bytes = await vscode.workspace.fs.readFile(manuscript);
        await vscode.workspace.fs.writeFile(
            document.uri,
            new TextEncoder().encode(
                fromMarkdown(new TextDecoder().decode(bytes)),
            ),
        );
        void vscode.window.showInformationMessage(
            `Imported ${vscode.workspace.asRelativePath(manuscript)} into ${vscode.workspace.asRelativePath(document.uri)}`,
        );
    }
}
