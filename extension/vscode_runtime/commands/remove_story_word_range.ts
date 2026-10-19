import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { SalientConceptCell } from "../storydoc/cells/salient_concept_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveStoryWordRangeCommand implements AuthorDocumentCommand {
    readonly commandName = "removeStoryWordRange";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        session.changeTheDocument((story) => {
            const annotationIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const annotation = story.cells[annotationIndex];
            if (!(annotation instanceof SalientConceptCell)) {
                return;
            }
            const rangesKept = annotation.storyWordRanges.filter(
                (range) =>
                    range.firstWord !== commandArguments.firstWord ||
                    range.lastWord !== commandArguments.lastWord,
            );
            story.cells[annotationIndex] = new SalientConceptCell(
                annotation.title,
                rangesKept,
                annotation.source,
                annotation.folded,
                annotation.at,
                annotation.uniqueId,
            );
        });
    }
}
