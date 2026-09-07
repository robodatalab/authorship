import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";
import { authorFileEditorSession } from "../author_file_editor_session";
import { writeTheCellFromTheServer } from "./written_cells";
import type { AuthorDocument } from "../storydoc/model";

export class WriteBlurbCommand implements AuthorDocumentCommand {
    readonly commandName = "writeBlurb";
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
        try {
            await writeTheCellFromTheServer(document, cell, "/generate/blurb", {
                path: document.uri.fsPath,
            });
        } catch (failure) {
            void vscode.window.showErrorMessage(
                `Cannot write the blurb — is the model server running? (${failure instanceof Error ? failure.message : String(failure)})`,
            );
            authorFileEditorSession(document)?.stopWritingCell(cell.uniqueId);
        }
    }
}
