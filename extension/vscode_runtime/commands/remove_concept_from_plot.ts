import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveConceptFromPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "removeConceptFromPlot";
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
            const referenced = plot.concepts(story);
            const conceptsKept = referenced.filter(
                (concept) => concept.uniqueId !== conceptCellId,
            );
            const plotKept = plot.withConcepts(conceptsKept);
            story.cells[plotIndex] = plotKept;
        });
    }
}
