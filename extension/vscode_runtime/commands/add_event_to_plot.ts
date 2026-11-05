import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell, PlotNode } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

/**
 * Adds an event to the end of a plot's trajectory, with nothing said of it yet
 * and no story text to tell it. The id is the caller's, so that the caller can
 * select the event it asked for.
 */
export class AddEventToPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "addEventToPlot";
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
            const plot = story.cellWithId(annotationCellId);
            if (
                !(plot instanceof PlotCell) ||
                plot.nodes.some((node) => node.nodeId === nodeId)
            ) {
                return story;
            }
            const eventAdded = new PlotNode(nodeId, null);
            const nodes = [...plot.nodes, eventAdded];
            const withTheEvent = new PlotCell(
                plot.title,
                nodes,
                plot.edges,
                plot.overview,
                plot.folded,
                plot.at,
                plot.uniqueId,
            );
            const concepts = plot.concepts(story);
            const plotGrown = withTheEvent.withConcepts(concepts);
            const storyChanged = story.withCell(plotGrown);
            return storyChanged;
        });
    }
}
