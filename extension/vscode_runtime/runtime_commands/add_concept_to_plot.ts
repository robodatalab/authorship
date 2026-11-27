import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddConceptToPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "addConceptToPlot";
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
            const concept = story.cellWithId(conceptCellId);
            if (!(concept instanceof SalientConceptCell)) {
                return story;
            }
            const referenced = plot.concepts(story);
            if (referenced.some((cell) => cell.uniqueId === conceptCellId)) {
                return story;
            }
            const concepts = [...referenced, concept];
            const plotReferencing = plot.withConcepts(concepts);
            const storyChanged = story.withCell(plotReferencing);
            return storyChanged;
        });
    }
}
