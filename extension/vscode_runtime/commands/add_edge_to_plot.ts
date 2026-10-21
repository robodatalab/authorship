import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, PlotEdge } from "../../library/storydoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddEdgeToPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "addEdgeToPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const fromNodeId = commandArguments.fromNodeId as string;
        const toNodeId = commandArguments.toNodeId as string;
        session.changeTheDocument((story) => {
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const plot = story.cells[plotIndex];
            if (!(plot instanceof PlotCell)) {
                return;
            }
            const nodeIds = plot.nodes.map((node) => node.nodeId);
            if (
                !nodeIds.includes(fromNodeId) ||
                !nodeIds.includes(toNodeId) ||
                fromNodeId === toNodeId
            ) {
                return;
            }
            if (
                plot.edges.some(
                    (edge) =>
                        edge.fromNodeId === fromNodeId &&
                        edge.toNodeId === toNodeId,
                )
            ) {
                return;
            }
            const edgeId = crypto.randomUUID();
            const edgeAdded = new PlotEdge(edgeId, fromNodeId, toNodeId);
            const edges = [...plot.edges, edgeAdded];
            story.cells[plotIndex] = new PlotCell(
                plot.title,
                plot.nodes,
                edges,
                plot.source,
                plot.folded,
                plot.at,
                plot.uniqueId,
            );
        });
    }
}
