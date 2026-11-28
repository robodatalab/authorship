import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const MOVE_NODE_IN_PLOT = "moveNodeInPlot";

export class MoveNodeInPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
        private readonly inPlaceOfNodeId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): MoveNodeInPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const inPlaceOfNodeId = serialized.inPlaceOfNodeId as string;
        const command = new MoveNodeInPlotCommand(
            annotationCellId,
            nodeId,
            inPlaceOfNodeId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const plotRearranged = plot.withNodeMovedInPlaceOf(
                this.nodeId,
                this.inPlaceOfNodeId,
            );
            const storyChanged = story.withCell(plotRearranged);
            return storyChanged;
        });
    }
}
