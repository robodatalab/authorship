import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import { CharacterCell } from "authordoc/cells/character_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddCharacterToPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "addCharacterToPlot";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const characterCellId = commandArguments.characterCellId as string;
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const character = story.cellWithId(characterCellId);
            if (!(character instanceof CharacterCell)) {
                return story;
            }
            const referenced = plot.characters(story);
            if (referenced.some((cell) => cell.uniqueId === characterCellId)) {
                return story;
            }
            const characters = [...referenced, character];
            const plotReferencing = plot.withCharacters(characters);
            const storyChanged = story.withCell(plotReferencing);
            return storyChanged;
        });
    }
}
