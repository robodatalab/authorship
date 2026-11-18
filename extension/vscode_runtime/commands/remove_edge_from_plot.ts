import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveEdgeFromPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "removeEdgeFromPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const edgesKept = plot.edges.filter(
                (edge) => edge.edgeId !== commandArguments.edgeId,
            );
            const plotKept = plot.withEdges(edgesKept);
            const storyChanged = story.withCell(plotKept);
            return storyChanged;
        });
    }
}
