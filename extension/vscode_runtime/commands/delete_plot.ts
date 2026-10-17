import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import type { AuthorDocumentCommand } from "./author_document_command";

const DELETE = "Delete";

export class DeletePlotCommand implements AuthorDocumentCommand {
    readonly commandName = "deletePlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const plotCellId = commandArguments.plotCellId as string;
        const plot = session.document.cellWithId(plotCellId);
        if (!plot) {
            return;
        }
        const answer = await vscode.window.showWarningMessage(
            `Delete the plot “${plot.attrs.title ?? ""}”?`,
            {
                modal: true,
                detail: "Its abstract and its trajectory go with it.",
            },
            DELETE,
        );
        if (answer !== DELETE) {
            return;
        }
        session.changeTheDocument((story) => story.removeCell(plotCellId));
    }
}
