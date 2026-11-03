import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddConceptToPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "addConceptToPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const conceptCellId = commandArguments.conceptCellId as string;
        session.changeTheDocument((story) => {
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const plot = story.cells[plotIndex];
            if (!(plot instanceof PlotCell)) {
                return;
            }
            const concept = story.cellWithId(conceptCellId);
            if (!(concept instanceof SalientConceptCell)) {
                return;
            }
            const referenced = plot.concepts(story);
            if (referenced.some((cell) => cell.uniqueId === conceptCellId)) {
                return;
            }
            const concepts = [...referenced, concept];
            const plotReferencing = plot.withConcepts(concepts);
            story.cells[plotIndex] = plotReferencing;
        });
    }
}
