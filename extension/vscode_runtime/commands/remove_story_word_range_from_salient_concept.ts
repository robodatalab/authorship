import type { AuthorFileEditorSession } from "../author_file_editor_session";
import {
    SALIENT_CONCEPT,
    SalientConceptCell,
} from "../../library/storydoc/cells/salient_concept_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveStoryWordRangeFromSalientConceptCommand implements AuthorDocumentCommand {
    readonly commandName = "removeStoryWordRangeFromSalientConcept";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const annotation = session.document.cellWithId(annotationCellId);
        if (!(annotation instanceof SalientConceptCell)) {
            return;
        }
        const referenceRemoved = annotation.references.findIndex(
            (reference) =>
                reference.storyWordRange.firstWord ===
                    commandArguments.firstWord &&
                reference.storyWordRange.lastWord === commandArguments.lastWord,
        );
        if (referenceRemoved === -1) {
            return;
        }
        const referencesKept = annotation.references.filter(
            (_reference, reference) => reference !== referenceRemoved,
        );
        const annotationWithoutTheReference = new SalientConceptCell(
            annotation.title,
            referencesKept,
            annotation.source,
            annotation.folded,
            annotation.at,
            annotation.uniqueId,
        );
        session.changeTheDocument((story) => {
            const annotationIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            story.cells[annotationIndex] = annotationWithoutTheReference;
        });
        session.thePassageWasRemoved(
            SALIENT_CONCEPT,
            annotationCellId,
            referenceRemoved,
        );
    }
}
