import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { applyPlan, askOf, doneOf, type Report } from "../publish/layout";
import { loadTemplates } from "../settings/file";
import { useTemplates } from "../settings/model";
import { MODEL_SERVER_PORT } from "../server/process";
import { AuthorDocument, Cell } from "../storydoc/model";

function nameOf(document: vscode.Uri): string {
    return document.path.split("/").pop() ?? document.path;
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export class ExportEpubCommand implements AuthorDocumentCommand {
    readonly name = "exportEpub";
    readonly category = "transfer";
    readonly iconClassName = "aicon aicon-export-epub";
    readonly tooltip = "Export EPUB — build the book beside this document";

    async invoke(document: AuthorDocument): Promise<void> {
        await this.bind(document, false);
    }

    /**
     * Build the book, from the document itself.
     *
     * Never by way of markdown: the cells are what say which section is which, and
     * markdown has no way to carry that — a title page flattened to a `#` line is
     * a book with no title, no cover and no chapters, only one long page.
     */
    private async bind(
        document: AuthorDocument,
        force: boolean,
    ): Promise<void> {
        try {
            // The server reads the file from disk, so what is on screen has to
            // be what it binds.
            await vscode.workspace.fs.writeFile(
                document.uri,
                new TextEncoder().encode(document.text),
            );
            const response = await fetch(
                `http://127.0.0.1:${MODEL_SERVER_PORT}/export/epub`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ path: document.uri.fsPath, force }),
                },
            );
            if (!response.ok) {
                void vscode.window.showErrorMessage(
                    `Export failed: ${response.statusText}`,
                );
                return;
            }
            const report = (await response.json()) as Report;
            if (report.path) {
                void vscode.window.showInformationMessage(
                    `Exported ${nameOf(vscode.Uri.file(report.path))}`,
                );
                return;
            }
            await this.layOut(document, report);
        } catch (err) {
            void vscode.window.showErrorMessage(
                `Export failed — is the model server running? (${describe(err)})`,
            );
        }
    }

    /**
     * Put to the author a book the server would not bind.
     *
     * **Fix does not export.** A section written in is an empty section, and a
     * book bound straight over one has a blank page where its cover should be —
     * so fixing lays the document out, leaves what is still wanting marked, and
     * hands it back. Only Export Anyway binds what is there, and only because the
     * author was shown what was missing and asked for the file regardless.
     */
    private async layOut(
        document: AuthorDocument,
        report: Report,
    ): Promise<void> {
        const name = nameOf(document.uri);
        const { message, detail } = askOf(name, report);
        const answer = await vscode.window.showWarningMessage(
            message,
            { modal: true, detail },
            "Fix",
            "Export Anyway",
        );
        if (answer === "Export Anyway") {
            await this.bind(document, true);
            return;
        }
        if (answer !== "Fix") {
            return;
        }
        // The sections the plan writes in are blank ones, and a blank disclaimer is
        // the workspace's. Read them here rather than trust what the last document
        // opened left behind.
        useTemplates(await loadTemplates(document.uri));
        const planned = applyPlan(document.cells, report.plan);
        while (document.cells.length > 0) {
            document.removeAt(0);
        }
        planned.forEach((cell, at) =>
            document.insertAt(at, new Cell(cell.kind, cell.source, cell.attrs)),
        );
        void vscode.window.showInformationMessage(doneOf(name, report));
    }
}
