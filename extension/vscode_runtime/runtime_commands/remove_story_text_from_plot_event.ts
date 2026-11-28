import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_STORY_TEXT_FROM_PLOT_EVENT = "removeStoryTextFromPlotEvent";

/** Leaves one event of a plot told by no story text, the event itself kept. */
export class RemoveStoryTextFromPlotEventCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveStoryTextFromPlotEventCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const command = new RemoveStoryTextFromPlotEventCommand(
            annotationCellId,
            nodeId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const event = plot.nodes.find(
                (node) => node.nodeId === this.nodeId,
            );
            if (event === undefined) {
                return story;
            }
            const eventUntold = event.withStoryWordRange(null);
            const plotUntold = plot.withNode(eventUntold);
            const storyChanged = story.withCell(plotUntold);
            return storyChanged;
        });
    }
}
