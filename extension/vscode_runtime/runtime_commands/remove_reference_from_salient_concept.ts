import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_REFERENCE_FROM_SALIENT_CONCEPT =
    "removeReferenceFromSalientConcept";

export class RemoveReferenceFromSalientConceptCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly referenceId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveReferenceFromSalientConceptCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const referenceId = serialized.referenceId as string;
        const command = new RemoveReferenceFromSalientConceptCommand(
            annotationCellId,
            referenceId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const annotation = story.cellWithId(this.annotationCellId);
            if (!(annotation instanceof SalientConceptCell)) {
                return story;
            }
            const referencesKept = annotation.references.filter(
                (reference) => reference.referenceId !== this.referenceId,
            );
            const annotationKept = new SalientConceptCell(
                annotation.title,
                referencesKept,
                annotation.source,
                annotation.folded,
                annotation.at,
                annotation.uniqueId,
            );
            const storyChanged = story.withCell(annotationKept);
            return storyChanged;
        });
    }
}
