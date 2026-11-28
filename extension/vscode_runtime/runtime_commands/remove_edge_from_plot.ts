import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_EDGE_FROM_PLOT = "removeEdgeFromPlot";

export class RemoveEdgeFromPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly edgeId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveEdgeFromPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const edgeId = serialized.edgeId as string;
        const command = new RemoveEdgeFromPlotCommand(annotationCellId, edgeId);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const edgesKept = plot.edges.filter(
                (edge) => edge.edgeId !== this.edgeId,
            );
            const plotKept = plot.withEdges(edgesKept);
            const storyChanged = story.withCell(plotKept);
            return storyChanged;
        });
    }
}
