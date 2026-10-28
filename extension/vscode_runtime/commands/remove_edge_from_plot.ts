import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveEdgeFromPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "removeEdgeFromPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        session.changeTheDocument((story) => {
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const plot = story.cells[plotIndex];
            if (!(plot instanceof PlotCell)) {
                return;
            }
            const edgesKept = plot.edges.filter(
                (edge) => edge.edgeId !== commandArguments.edgeId,
            );
            story.cells[plotIndex] = new PlotCell(
                plot.title,
                plot.nodes,
                edgesKept,
                plot.overview,
                plot.folded,
                plot.at,
                plot.uniqueId,
            );
        });
    }
}
