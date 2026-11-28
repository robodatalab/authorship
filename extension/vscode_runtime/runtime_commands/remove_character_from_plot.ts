import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_CHARACTER_FROM_PLOT = "removeCharacterFromPlot";

export class RemoveCharacterFromPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly characterCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveCharacterFromPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const characterCellId = serialized.characterCellId as string;
        const command = new RemoveCharacterFromPlotCommand(
            annotationCellId,
            characterCellId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(this.annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const referenced = plot.characters(story);
            const charactersKept = referenced.filter(
                (character) => character.uniqueId !== this.characterCellId,
            );
            const plotKept = plot.withCharacters(charactersKept);
            const storyChanged = story.withCell(plotKept);
            return storyChanged;
        });
    }
}
