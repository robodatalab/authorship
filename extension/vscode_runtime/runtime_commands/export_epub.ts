import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { RuntimeCommand } from "./runtime_command";
import {
    askedBeforeBinding,
    cellsWithMissingCellsAppended,
    saidAfterLayingOut,
    type BookLayoutReport,
} from "../publish/book_layout_report";
import { fetchFromServer } from "../server/fetch";

function fileNameOf(file: vscode.Uri): string {
    return file.path.split("/").pop() ?? file.path;
}

function whatWentWrong(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
}

export const EXPORT_EPUB = "exportEpub";

export class ExportEpubCommand implements RuntimeCommand {
    static deserialize(): ExportEpubCommand {
        const command = new ExportEpubCommand();
        return command;
    }

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
                    path: session.document.path,
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
        const fileName = fileNameOf(session.uri);
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
        const withMissingCells = cellsWithMissingCellsAppended(session.document.cells, report.missing_cells);
        session.changeTheDocument((story) => {
            const storyWithMissingCells = story.withCells(withMissingCells);
            return storyWithMissingCells;
        });
        void vscode.window.showInformationMessage(
            saidAfterLayingOut(fileName, report),
        );
    }
}
