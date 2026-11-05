import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

/**
 * Gives a plot a new overview, in the plot as the document has it now, so that
 * its events — whatever was said of them since the page last drew the plot —
 * are kept.
 */
export class RedescribePlotCommand implements AuthorDocumentCommand {
    readonly commandName = "redescribePlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const overview = commandArguments.overview as string;
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const plotRedescribed = plot.withOverview(overview);
            const storyChanged = story.withCell(plotRedescribed);
            return storyChanged;
        });
    }
}
