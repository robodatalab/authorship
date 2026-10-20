import type { AuthorFileEditorSession } from "../author_file_editor_session";
import * as vscode from "vscode";

import { PLOT, PlotCell } from "../../library/storydoc/cells/plot_cell";
import { SALIENT_CONCEPT, SalientConceptCell } from "../../library/storydoc/cells/salient_concept_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

const DELETE = "Delete";

const WHAT_GOES_WITH_THE_ANNOTATION: Record<string, string> = {
    [SALIENT_CONCEPT]: "Its description and the words assigned to it go with it.",
    [PLOT]: "Its abstract and its trajectory go with it.",
};

export class DeleteStoryAnnotationCommand implements AuthorDocumentCommand {
    readonly commandName = "deleteStoryAnnotation";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    async invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): Promise<void> {
        const annotationCellId = commandArguments.annotationCellId as string;
        const annotation = session.document.cellWithId(annotationCellId);
        if (
            !(annotation instanceof SalientConceptCell) &&
            !(annotation instanceof PlotCell)
        ) {
            return;
        }
        const answer = await vscode.window.showWarningMessage(
            `Delete the ${annotation.kind} “${annotation.title}”?`,
            {
                modal: true,
                detail: WHAT_GOES_WITH_THE_ANNOTATION[annotation.kind],
            },
            DELETE,
        );
        if (answer !== DELETE) {
            return;
        }
        session.changeTheDocument((story) => {
            story.cells = story.cells.filter(
                (cell) => cell.uniqueId !== annotationCellId,
            );
        });
    }
}
