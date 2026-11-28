import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { CharacterCell } from "authordoc/cells/character_cell";
import { PlotCell } from "authordoc/cells/plot_cell";
import type { RuntimeCommand } from "./runtime_command";

export const ADD_CHARACTER_TO_PLOT_EVENT = "addCharacterToPlotEvent";

export class AddCharacterToPlotEventCommand implements RuntimeCommand {
    constructor(
        private readonly annotationCellId: string,
        private readonly nodeId: string,
        private readonly characterCellId: string,
    ) {}

    static deserialize(
        serialized: Record<string, unknown>,
    ): AddCharacterToPlotEventCommand {
        const annotationCellId = serialized.annotationCellId as string;
        const nodeId = serialized.nodeId as string;
        const characterCellId = serialized.characterCellId as string;
        const command = new AddCharacterToPlotEventCommand(
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
            const character = story.cellWithId(this.characterCellId);
            if (!(character instanceof CharacterCell)) {
                return story;
            }
            const referenced = event.characters(story);
            if (
                referenced.some(
                    (cell) => cell.uniqueId === this.characterCellId,
                )
            ) {
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
