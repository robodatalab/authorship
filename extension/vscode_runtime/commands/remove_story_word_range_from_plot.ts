import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PLOT, PlotCell } from "../../library/storydoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveStoryWordRangeFromPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "removeStoryWordRangeFromPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const plot = session.document.cellWithId(annotationCellId);
        if (!(plot instanceof PlotCell)) {
            return;
        }
        const nodeRemoved = plot.nodes.findIndex(
            (node) =>
                node.storyWordRange.firstWord === commandArguments.firstWord &&
                node.storyWordRange.lastWord === commandArguments.lastWord,
        );
        if (nodeRemoved === -1) {
            return;
        }
        const nodesKept = plot.nodes.filter(
            (_node, node) => node !== nodeRemoved,
        );
        const nodeIdsKept = nodesKept.map((node) => node.nodeId);
        const edgesKept = plot.edges.filter(
            (edge) =>
                nodeIdsKept.includes(edge.fromNodeId) &&
                nodeIdsKept.includes(edge.toNodeId),
        );
        const plotWithoutTheNode = new PlotCell(
            plot.title,
            nodesKept,
            edgesKept,
            plot.source,
            plot.folded,
            plot.at,
            plot.uniqueId,
        );
        session.changeTheDocument((story) => {
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            story.cells[plotIndex] = plotWithoutTheNode;
        });
        session.thePassageWasRemoved(PLOT, annotationCellId, nodeRemoved);
    }
}
