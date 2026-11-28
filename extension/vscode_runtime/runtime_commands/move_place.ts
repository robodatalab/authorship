import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlaceCell } from "authordoc/cells/place_cell";
import type { RuntimeCommand } from "./runtime_command";
import { moveTheSection } from "./move_cell";

export const MOVE_PLACE = "movePlace";

export class MovePlaceCommand implements RuntimeCommand {
    constructor(
        private readonly placeCellId: string,
        private readonly beforeCellId: string | null,
        private readonly parentCellId: string,
    ) {}

    static deserialize(serialized: Record<string, unknown>): MovePlaceCommand {
        const placeCellId = serialized.placeCellId as string;
        const beforeCellId = serialized.beforeCellId as string | null;
        const parentCellId = serialized.parentCellId as string;
        const command = new MovePlaceCommand(
            placeCellId,
            beforeCellId,
            parentCellId,
        );
        return command;
    }

    invoke(session: AuthorFileEditorSession): void {
        session.changeTheDocument((story) => {
            const place = story.cellWithId(this.placeCellId);
            if (!(place instanceof PlaceCell)) {
                return story;
            }
            const named = story.cellWithId(this.parentCellId);
            const parent = named instanceof PlaceCell ? named : null;
            const moved = moveTheSection(
                story,
                this.placeCellId,
                this.beforeCellId,
            );
            const placed = place.withParent(parent);
            const storyChanged = moved.withCell(placed);
            return storyChanged;
        });
    }
}
