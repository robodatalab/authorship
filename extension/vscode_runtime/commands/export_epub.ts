import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    askedBeforeBinding,
    cellsLaidOutByPlan,
    saidAfterLayingOut,
    type BookLayoutReport,
} from "../publish/book_layout_report";
import { fetchFromServer } from "../server/fetch";
import { AuthorDocument, Cell } from "../storydoc/model";

function fileNameOf(file: vscode.Uri): string {
    return file.path.split("/").pop() ?? file.path;
}

function whatWentWrong(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
}

export class ExportEpubCommand implements AuthorDocumentCommand {
    readonly commandName = "exportEpub";
    readonly buttonGroup = "transfer";
    readonly iconClassName = "aicon aicon-export-epub";
    readonly tooltip = "Export EPUB — build the book beside this document";

    async invoke(document: AuthorDocument): Promise<void> {
        await this.bindTheBook(document, false);
    }

    private async bindTheBook(
        document: AuthorDocument,
        bindWhateverIsThere: boolean,
    ): Promise<void> {
        try {
            await vscode.workspace.fs.writeFile(
                document.uri,
                new TextEncoder().encode(document.text),
            );
            const report = await fetchFromServer<BookLayoutReport>(
                "/export/epub",
                {
                    path: document.uri.fsPath,
                    force: bindWhateverIsThere,
                },
            );
            if (report.path) {
                void vscode.window.showInformationMessage(
                    `Exported ${fileNameOf(vscode.Uri.file(report.path))}`,
                );
                return;
            }
            await this.askWhatToDoAboutIt(document, report);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Export failed — is the model server running? (${whatWentWrong(failure)})`,
            );
        }
    }

    private async askWhatToDoAboutIt(
        document: AuthorDocument,
        report: BookLayoutReport,
    ): Promise<void> {
        const fileName = fileNameOf(document.uri);
        const { message, detail } = askedBeforeBinding(fileName, report);
        const answer = await vscode.window.showWarningMessage(
            message,
            { modal: true, detail },
            "Fix",
            "Export Anyway",
        );
        if (answer === "Export Anyway") {
            await this.bindTheBook(document, true);
            return;
        }
        if (answer !== "Fix") {
            return;
        }
        const laidOut = cellsLaidOutByPlan(document.cells, report.plan);
        document.removeCellsAt(0, document.cells.length);
        laidOut.forEach((cell, cellIndex) =>
            document.insertAt(
                cellIndex,
                new Cell(cell.kind, cell.source, cell.attrs),
            ),
        );
        void vscode.window.showInformationMessage(
            saidAfterLayingOut(fileName, report),
        );
    }
}
