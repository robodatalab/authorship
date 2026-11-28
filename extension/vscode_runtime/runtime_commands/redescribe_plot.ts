import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REDESCRIBE_PLOT = "redescribePlot";

/**
 * Gives a plot a new overview, in the plot as the document has it now, so that
 * its events — whatever was said of them since the page last drew the plot —
 * are kept.
 */
export class RedescribePlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly overview: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RedescribePlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const overview = serialized.overview as string;
        const command = new RedescribePlotCommand(annotationCellId, overview);
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const plotRedescribed = plot.withOverview(this.overview);
            const storyChanged = story.withCell(plotRedescribed);
            return storyChanged;
        });
    }
}
