import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_NODE_FROM_PLOT = "removeNodeFromPlot";

export class RemoveNodeFromPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveNodeFromPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const command = new RemoveNodeFromPlotCommand(annotationCellId, nodeId);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const nodesKept = plot.nodes.filter(
                (node) => node.nodeId !== this.nodeId,
            );
            const edgesKept = plot.edges.filter(
                (edge) =>
                    edge.fromNodeId !== this.nodeId &&
                    edge.toNodeId !== this.nodeId,
            );
            const withoutTheNode = plot.withNodes(nodesKept);
            const plotKept = withoutTheNode.withEdges(edgesKept);
            const storyChanged = story.withCell(plotKept);
            return storyChanged;
        });
    }
}
