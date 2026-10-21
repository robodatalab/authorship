import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "../../library/storydoc/cells/plot_cell";
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
        session.changeTheDocument((story) => {
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const plot = story.cells[plotIndex];
            if (!(plot instanceof PlotCell)) {
                return;
            }
            const nodesKept = plot.nodes.filter(
                (node) =>
                    node.storyWordRange.firstWord !==
                        commandArguments.firstWord ||
                    node.storyWordRange.lastWord !== commandArguments.lastWord,
            );
            const nodeIdsKept = nodesKept.map((node) => node.nodeId);
            const edgesKept = plot.edges.filter(
                (edge) =>
                    nodeIdsKept.includes(edge.fromNodeId) &&
                    nodeIdsKept.includes(edge.toNodeId),
            );
            story.cells[plotIndex] = new PlotCell(
                plot.title,
                nodesKept,
                edgesKept,
                plot.source,
                plot.folded,
                plot.at,
                plot.uniqueId,
            );
        });
    }
}
