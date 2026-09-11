import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import {
    askedBeforeBinding,
    cellsLaidOutByPlan,
    saidAfterLayingOut,
    type BookLayoutReport,
} from "../publish/book_layout_report";
import { fetchFromServer } from "../server/fetch";
import { ImmutableAuthorDocument, MutableCell } from "../storydoc/model";

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
    readonly tooltip =
        "Export EPUB — build the book beside this session.document";

    async invoke(session: AuthorFileEditorSession): Promise<void> {
        await this.bindTheBook(session, false);
    }

    private async bindTheBook(
        session: AuthorFileEditorSession,
        bindWhateverIsThere: boolean,
    ): Promise<void> {
        try {
            const report = await fetchFromServer<BookLayoutReport>(
                "/export/epub",
                {
                    path: session.document.uri.fsPath,
                    text: session.document.text,
                    force: bindWhateverIsThere,
                },
            );
            if (report.path) {
                void vscode.window.showInformationMessage(
                    `Exported ${fileNameOf(vscode.Uri.file(report.path))}`,
                );
                return;
            }
            await this.askWhatToDoAboutIt(session, report);
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Export failed — is the model server running? (${whatWentWrong(failure)})`,
            );
        }
    }

    private async askWhatToDoAboutIt(
        session: AuthorFileEditorSession,
        report: BookLayoutReport,
    ): Promise<void> {
        const fileName = fileNameOf(session.document.uri);
        const { message, detail } = askedBeforeBinding(fileName, report);
        const answer = await vscode.window.showWarningMessage(
            message,
            { modal: true, detail },
            "Fix",
            "Export Anyway",
        );
        if (answer === "Export Anyway") {
            await this.bindTheBook(session, true);
            return;
        }
        if (answer !== "Fix") {
            return;
        }
        const laidOut = cellsLaidOutByPlan(session.document.cells, report.plan);
        session.changeTheDocument((story) => {
            story.removeCellsAt(0, story.cells.length);
            laidOut.forEach((cell, cellIndex) =>
                story.insertAt(
                    cellIndex,
                    new MutableCell(cell.kind, cell.source, cell.attrs),
                ),
            );
        });
        void vscode.window.showInformationMessage(
            saidAfterLayingOut(fileName, report),
        );
    }
}
