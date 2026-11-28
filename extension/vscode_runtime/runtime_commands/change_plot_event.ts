import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlaceCell } from "authordoc/cells/place_cell";
import { PlotCell, type PlotNode } from "authordoc/cells/plot_cell";
import type { Document } from "authordoc/storydoc";
import type { RuntimeCommand } from "./runtime_command";

// What of an event the author can say, and how each is said of it.
const SAID_OF_AN_EVENT: Record<
    string,
    (event: PlotNode, said: string, story: Document) => PlotNode
> = {
    summary: (event, said) => event.withSummary(said),
    timestamp: (event, said) => event.withTimestamp(said),
    place: (event, said, story) => {
        const referenced = story.cellWithId(said);
        const place = referenced instanceof PlaceCell ? referenced : null;
        const placed = event.withPlace(place);
        return placed;
    },
};

export const CHANGE_PLOT_EVENT = "changePlotEvent";

/**
 * Says one thing of one event of a plot — its summary, its timestamp or the id
 * of its place — in the plot as the document has it now, so that nothing else
 * said of the plot since the page last drew it is undone.
 */
export class ChangePlotEventCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
        private readonly said: string,
        private readonly field: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): ChangePlotEventCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const said = serialized.said as string;
        const field = serialized.field as string;
        const command = new ChangePlotEventCommand(
            annotationCellId,
            nodeId,
            said,
            field,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        const sayIt = SAID_OF_AN_EVENT[this.field];
        if (sayIt === undefined) {
            return;
        }
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
            const eventChanged = sayIt(event, this.said, story);
            const plotChanged = plot.withNode(eventChanged);
            const storyChanged = story.withCell(plotChanged);
            return storyChanged;
        });
    }
}
