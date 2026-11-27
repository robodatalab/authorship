import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { CharacterCell } from "authordoc/cells/character_cell";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class AddCharacterToPlotEventCommand implements AuthorDocumentCommand {
    readonly commandName = "addCharacterToPlotEvent";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const annotationCellId = commandArguments.annotationCellId as string;
        const nodeId = commandArguments.nodeId as string;
        const characterCellId = commandArguments.characterCellId as string;
        session.changeTheDocument((story) => {
            const plot = story.cellWithId(annotationCellId);
            if (!(plot instanceof PlotCell)) {
                return story;
            }
            const event = plot.nodes.find((node) => node.nodeId === nodeId);
            if (event === undefined) {
                return story;
            }
            const character = story.cellWithId(characterCellId);
            if (!(character instanceof CharacterCell)) {
                return story;
            }
            const referenced = event.characters(story);
            if (referenced.some((cell) => cell.uniqueId === characterCellId)) {
                return story;
            }
            const characters = [...referenced, character];
            const eventReferencing = event.withCharacters(characters);
            const plotChanged = plot.withNode(eventReferencing);
            const storyChanged = story.withCell(plotChanged);
            return storyChanged;
        });
    }
}
