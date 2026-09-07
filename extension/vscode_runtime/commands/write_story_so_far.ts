import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { authorFileEditorSession } from "../author_file_editor_session";
import { writeTheCellFromTheServer } from "./written_cells";
import type { AuthorDocument } from "../storydoc/model";

const DOCUMENTS_THE_STORY_SO_FAR_SUMMARISES = "documents";

export class WriteStorySoFarCommand implements AuthorDocumentCommand {
    readonly commandName = "writeStorySoFar";
    readonly buttonGroup = "run";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        document: AuthorDocument,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const cell = document.cells[commandArguments.cellIndex as number];
        if (!cell) {
            return;
        }
        const documents = (
            cell.attrs[DOCUMENTS_THE_STORY_SO_FAR_SUMMARISES] ?? ""
        )
            .split(",")
            .map((named) => named.trim())
            .filter(Boolean);
        if (documents.length === 0) {
            void vscode.window.showErrorMessage(
                "Name the documents to summarise before writing the story so far.",
            );
            return;
        }
        try {
            await writeTheCellFromTheServer(document, cell, "/generate/recap", {
                path: document.uri.fsPath,
                documents,
            });
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the story so far — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
            authorFileEditorSession(document)?.stopWritingCell(cell.uniqueId);
        }
    }
}
