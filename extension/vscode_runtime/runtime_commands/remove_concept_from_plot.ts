import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_CONCEPT_FROM_PLOT = "removeConceptFromPlot";

export class RemoveConceptFromPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly conceptCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveConceptFromPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const conceptCellId = serialized.conceptCellId as string;
        const command = new RemoveConceptFromPlotCommand(
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
            const referenced = plot.concepts(story);
            const conceptsKept = referenced.filter(
                (concept) => concept.uniqueId !== this.conceptCellId,
            );
            const plotKept = plot.withConcepts(conceptsKept);
            const storyChanged = story.withCell(plotKept);
            return storyChanged;
        });
    }
}
