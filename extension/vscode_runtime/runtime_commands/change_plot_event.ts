import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlaceCell } from "authordoc/cells/place_cell";
import { PlotCell, type PlotNode } from "authordoc/cells/plot_cell";
import type { Document } from "authordoc/storydoc";
import type { AuthorDocumentCommand } from "./author_document_command";

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

/**
 * Says one thing of one event of a plot — its summary, its timestamp or the id
 * of its place — in the plot as the document has it now, so that nothing else
 * said of the plot since the page last drew it is undone.
 */
export class ChangePlotEventCommand implements AuthorDocumentCommand {
    readonly commandName = "changePlotEvent";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const nodeId = commandArguments.nodeId as string;
        const sayIt = SAID_OF_AN_EVENT[commandArguments.field as string];
        const said = commandArguments.said as string;
        if (sayIt === undefined) {
            return;
        }
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const event = plot.nodes.find((node) => node.nodeId === nodeId);
            if (event === undefined) {
                return story;
            }
            const eventChanged = sayIt(event, said, story);
            const plotChanged = plot.withNode(eventChanged);
            const storyChanged = story.withCell(plotChanged);
            return storyChanged;
        });
    }
}
