import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlaceCell } from "authordoc/cells/place_cell";
import { placeMayLieWithin } from "../place_hierarchy";
import type { AuthorDocumentCommand } from "./author_document_command";
import { moveTheSection } from "./move_cell";

export class MovePlaceCommand implements AuthorDocumentCommand {
    readonly commandName = "movePlace";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const placeCellId = commandArguments.placeCellId as string;
        const beforeCellId = commandArguments.beforeCellId as string | null;
        const parentCellId = commandArguments.parentCellId as string;
        session.changeTheDocument((story) => {
            const place = story.cellWithId(placeCellId);
            if (!(place instanceof PlaceCell)) {
                return story;
            }
            const named = story.cellWithId(parentCellId);
            const parent = named instanceof PlaceCell ? named : null;
            if (parent !== null && !placeMayLieWithin(place, parent, story)) {
                return story;
            }
            const moved = moveTheSection(story, placeCellId, beforeCellId);
            const placed = place.withParent(parent);
            const storyChanged = moved.withCell(placed);
            return storyChanged;
        });
    }
}
