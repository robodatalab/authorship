import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveReferenceFromSalientConceptCommand implements AuthorDocumentCommand {
    readonly commandName = "removeReferenceFromSalientConcept";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const referenceId = commandArguments.referenceId as string;
        session.changeTheDocument((story) => {
            const annotationIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const annotation = story.cells[annotationIndex];
            if (!(annotation instanceof SalientConceptCell)) {
                return;
            }
            const referencesKept = annotation.references.filter(
                (reference) => reference.referenceId !== referenceId,
            );
            story.cells[annotationIndex] = new SalientConceptCell(
                annotation.title,
                referencesKept,
                annotation.source,
                annotation.folded,
                annotation.at,
                annotation.uniqueId,
            );
        });
    }
}
