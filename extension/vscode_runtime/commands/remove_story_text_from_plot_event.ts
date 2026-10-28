import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

/** Leaves one event of a plot told by no story text, the event itself kept. */
export class RemoveStoryTextFromPlotEventCommand implements AuthorDocumentCommand {
    readonly commandName = "removeStoryTextFromPlotEvent";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const nodeId = commandArguments.nodeId as string;
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
            const eventUntold = event.withStoryWordRange(null);
            story.cells[plotIndex] = plot.withNode(eventUntold);
        });
    }
}
