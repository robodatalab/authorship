import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveConceptFromPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "removeConceptFromPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const conceptCellId = commandArguments.conceptCellId as string;
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const referenced = plot.concepts(story);
            const conceptsKept = referenced.filter(
                (concept) => concept.uniqueId !== conceptCellId,
            );
            const plotKept = plot.withConcepts(conceptsKept);
            const storyChanged = story.withCell(plotKept);
            return storyChanged;
        });
    }
}
