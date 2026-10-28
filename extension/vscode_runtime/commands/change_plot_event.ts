import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, type PlotNode } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

// What of an event the author can say, and how each is said of it.
const SAID_OF_AN_EVENT: Record<string, (event: PlotNode, said: string) => PlotNode> = {
    summary: (event, said) => event.withSummary(said),
    timestamp: (event, said) => event.withTimestamp(said),
    location: (event, said) => event.withLocation(said),
};

/**
 * Says one thing of one event of a plot — its summary, its timestamp or its
 * location — in the plot as the document has it now, so that nothing else said
 * of the plot since the page last drew it is undone.
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
            const plotIndex = story.cells.findIndex(
                (cell) => cell.uniqueId === annotationCellId,
            );
            const plot = story.cells[plotIndex];
            if (!(plot instanceof PlotCell)) {
                return;
            }
            const event = plot.nodes.find((node) => node.nodeId === nodeId);
            if (event === undefined) {
                return;
            }
            const eventChanged = sayIt(event, said);
            story.cells[plotIndex] = plot.withNode(eventChanged);
        });
    }
}
