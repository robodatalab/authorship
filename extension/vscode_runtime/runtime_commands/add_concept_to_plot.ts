import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import { SalientConceptCell } from "authordoc/cells/salient_concept_cell";
import type { RuntimeCommand } from "./runtime_command";

export const ADD_CONCEPT_TO_PLOT = "addConceptToPlot";

export class AddConceptToPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly conceptCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AddConceptToPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const conceptCellId = serialized.conceptCellId as string;
        const command = new AddConceptToPlotCommand(
            annotationCellId,
            conceptCellId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const concept = story.cellWithId(this.conceptCellId);
            if (!(concept instanceof SalientConceptCell)) {
                return story;
            }
            const referenced = plot.concepts(story);
            if (
                referenced.some((cell) => cell.uniqueId === this.conceptCellId)
            ) {
                return story;
            }
            const concepts = [...referenced, concept];
            const plotReferencing = plot.withConcepts(concepts);
            const storyChanged = story.withCell(plotReferencing);
            return storyChanged;
        });
    }
}
