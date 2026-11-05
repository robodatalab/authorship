import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, PlotEdge } from "authordoc/cells/plot_cell";
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
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const nodeIds = plot.nodes.map((node) => node.nodeId);
            if (
                !nodeIds.includes(fromNodeId) ||
                !nodeIds.includes(toNodeId) ||
                fromNodeId === toNodeId
            ) {
                return story;
            }
            if (
                plot.edges.some(
                    (edge) =>
                        edge.fromNodeId === fromNodeId &&
                        edge.toNodeId === toNodeId,
                )
            ) {
                return story;
            }
            const edgeId = crypto.randomUUID();
            const edgeAdded = new PlotEdge(edgeId, fromNodeId, toNodeId);
            const edges = [...plot.edges, edgeAdded];
            const withTheEdge = new PlotCell(
                plot.title,
                plot.nodes,
                edges,
                plot.overview,
                plot.folded,
                plot.at,
                plot.uniqueId,
            );
            const concepts = plot.concepts(story);
            const plotConnected = withTheEdge.withConcepts(concepts);
            const storyChanged = story.withCell(plotConnected);
            return storyChanged;
        });
    }
}
