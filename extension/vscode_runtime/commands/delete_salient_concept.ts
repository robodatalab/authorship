import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";

const DELETE = "Delete";

export class DeleteSalientConceptCommand implements AuthorDocumentCommand {
    readonly commandName = "deleteSalientConcept";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const conceptCellId = commandArguments.conceptCellId as string;
        const concept = session.document.cellWithId(conceptCellId);
        if (!concept) {
            return;
        }
        const answer = await vscode.window.showWarningMessage(
            `Delete the salient concept “${concept.attrs.title ?? ""}”?`,
            {
                modal: true,
                detail: "Its description and the words assigned to it go with it.",
            },
            DELETE,
        );
        if (answer !== DELETE) {
            return;
        }
        session.changeTheDocument((story) => story.removeCell(conceptCellId));
    }
}
