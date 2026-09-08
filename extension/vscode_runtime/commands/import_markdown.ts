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
        const chosenFiles = await vscode.window.showOpenDialog({
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
        if (!chosenFiles || chosenFiles.length === 0) {
            return;
        }
        const manuscript = chosenFiles[0];
        const answer = await vscode.window.showWarningMessage(
            `Replace everything in ${vscode.workspace.asRelativePath(document.uri)} with ${vscode.workspace.asRelativePath(manuscript)}?`,
            { modal: true },
            "Replace",
        );
        if (answer !== "Replace") {
            return;
        }
        const manuscriptBytes = await vscode.workspace.fs.readFile(manuscript);
        await vscode.workspace.fs.writeFile(
            document.uri,
            new TextEncoder().encode(
                fromMarkdown(new TextDecoder().decode(manuscriptBytes)),
            ),
        );
        void vscode.window.showInformationMessage(
            `Imported ${vscode.workspace.asRelativePath(manuscript)} into ${vscode.workspace.asRelativePath(document.uri)}`,
        );
    }
}
