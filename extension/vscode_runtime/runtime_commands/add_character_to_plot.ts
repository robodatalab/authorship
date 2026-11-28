import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import { CharacterCell } from "authordoc/cells/character_cell";
import type { RuntimeCommand } from "./runtime_command";

export const ADD_CHARACTER_TO_PLOT = "addCharacterToPlot";

export class AddCharacterToPlotCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly characterCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AddCharacterToPlotCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const characterCellId = serialized.characterCellId as string;
        const command = new AddCharacterToPlotCommand(
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
            const character = story.cellWithId(this.characterCellId);
            if (!(character instanceof CharacterCell)) {
                return story;
            }
            const referenced = plot.characters(story);
            if (
                referenced.some(
                    (cell) => cell.uniqueId === this.characterCellId,
                )
            ) {
                return story;
            }
            const characters = [...referenced, character];
            const plotReferencing = plot.withCharacters(characters);
            const storyChanged = story.withCell(plotReferencing);
            return storyChanged;
        });
    }
}
