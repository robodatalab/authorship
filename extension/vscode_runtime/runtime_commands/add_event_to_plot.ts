import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, PlotNode } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const ADD_EVENT_TO_PLOT = "addEventToPlot";

/**
 * Adds an event to the end of a plot's trajectory, with nothing said of it yet
 * and no story text to tell it. The id is the caller's, so that the caller can
 * select the event it asked for.
 */
export class AddEventToPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AddEventToPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const command = new AddEventToPlotCommand(annotationCellId, nodeId);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (
                !(plot instanceof PlotCell) ||
                plot.nodes.some((node) => node.nodeId === this.nodeId)
            ) {
                return story;
            }
            const eventAdded = new PlotNode(this.nodeId, null);
            const nodes = [...plot.nodes, eventAdded];
            const plotGrown = plot.withNodes(nodes);
            const storyChanged = story.withCell(plotGrown);
            return storyChanged;
        });
    }
}
