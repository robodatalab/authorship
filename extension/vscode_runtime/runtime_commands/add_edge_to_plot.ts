import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, PlotEdge } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const ADD_EDGE_TO_PLOT = "addEdgeToPlot";

export class AddEdgeToPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly fromNodeId: string,
        private readonly toNodeId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AddEdgeToPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const fromNodeId = serialized.fromNodeId as string;
        const toNodeId = serialized.toNodeId as string;
        const command = new AddEdgeToPlotCommand(
            annotationCellId,
            fromNodeId,
            toNodeId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const nodeIds = plot.nodes.map((node) => node.nodeId);
            if (
                !nodeIds.includes(this.fromNodeId) ||
                !nodeIds.includes(this.toNodeId) ||
                this.fromNodeId === this.toNodeId
            ) {
                return story;
            }
            if (
                plot.edges.some(
                    (edge) =>
                        edge.fromNodeId === this.fromNodeId &&
                        edge.toNodeId === this.toNodeId,
                )
            ) {
                return story;
            }
            const edgeId = crypto.randomUUID();
            const edgeAdded = new PlotEdge(
                edgeId,
                this.fromNodeId,
                this.toNodeId,
            );
            const edges = [...plot.edges, edgeAdded];
            const plotConnected = plot.withEdges(edges);
            const storyChanged = story.withCell(plotConnected);
            return storyChanged;
        });
    }
}
