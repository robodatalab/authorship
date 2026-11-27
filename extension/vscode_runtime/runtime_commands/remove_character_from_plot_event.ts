import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { AuthorDocumentCommand } from "./author_document_command";

export class RemoveCharacterFromPlotEventCommand implements AuthorDocumentCommand {
    readonly commandName = "removeCharacterFromPlotEvent";
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
            const referenced = event.characters(story);
            const charactersKept = referenced.filter(
                (character) => character.uniqueId !== characterCellId,
            );
            const eventKept = event.withCharacters(charactersKept);
            const plotChanged = plot.withNode(eventKept);
            const storyChanged = story.withCell(plotChanged);
            return storyChanged;
        });
    }
}
