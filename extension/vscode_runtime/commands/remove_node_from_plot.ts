import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "../../library/storydoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveNodeFromPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "removeNodeFromPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const nodeId = commandArguments.nodeId as string;
        session.changeTheDocument((story) => {
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const plot = story.cells[plotIndex];
            if (!(plot instanceof PlotCell)) {
                return;
            }
            const nodesKept = plot.nodes.filter(
                (node) => node.nodeId !== nodeId,
            );
            const edgesKept = plot.edges.filter(
                (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId,
            );
            story.cells[plotIndex] = new PlotCell(
                plot.title,
                nodesKept,
                edgesKept,
                plot.overview,
                plot.folded,
                plot.at,
                plot.uniqueId,
            );
        });
    }
}
