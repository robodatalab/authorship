import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveCharacterFromPlotCommand implements AuthorDocumentCommand {
    readonly commandName = "removeCharacterFromPlot";
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
            const referenced = plot.characters(story);
            const charactersKept = referenced.filter(
                (character) => character.uniqueId !== characterCellId,
            );
            const plotKept = plot.withCharacters(charactersKept);
            const storyChanged = story.withCell(plotKept);
            return storyChanged;
        });
    }
}
