import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const REMOVE_CHARACTER_FROM_PLOT_EVENT = "removeCharacterFromPlotEvent";

export class RemoveCharacterFromPlotEventCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
        private readonly characterCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): RemoveCharacterFromPlotEventCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const characterCellId = serialized.characterCellId as string;
        const command = new RemoveCharacterFromPlotEventCommand(
            annotationCellId,
            nodeId,
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
            const event = plot.nodes.find(
                (node) => node.nodeId === this.nodeId,
            );
            if (event === undefined) {
                return story;
            }
            const referenced = event.characters(story);
            const charactersKept = referenced.filter(
                (character) => character.uniqueId !== this.characterCellId,
            );
            const eventKept = event.withCharacters(charactersKept);
            const plotChanged = plot.withNode(eventKept);
            const storyChanged = story.withCell(plotChanged);
            return storyChanged;
        });
    }
}
