import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class MoveNodeInPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "moveNodeInPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const nodeId = commandArguments.nodeId as string;
        const inPlaceOfNodeId = commandArguments.inPlaceOfNodeId as string;
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const plotRearranged = plot.withNodeMovedInPlaceOf(
                nodeId,
                inPlaceOfNodeId,
            );
            const storyChanged = story.withCell(plotRearranged);
            return storyChanged;
        });
    }
}
