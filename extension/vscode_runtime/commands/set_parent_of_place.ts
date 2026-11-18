import type { AuthorFileEditorSession } from "../author_file_editor_session";
import { PlaceCell } from "authordoc/cells/place_cell";
import { placesAround } from "../place_hierarchy";
import type { AuthorDocumentCommand } from "./author_document_command";

export class SetParentOfPlaceCommand implements AuthorDocumentCommand {
    readonly commandName = "setParentOfPlace";
    readonly buttonGroup = "edit";
    readonly iconClassName = "";
    readonly tooltip = "";

    invoke(
        session: AuthorFileEditorSession,
        commandArguments: Record<string, unknown>,
    ): void {
        const placeCellId = commandArguments.placeCellId as string;
        const parentCellId = commandArguments.parentCellId as string;
        session.changeTheDocument((story) => {
            const place = story.cellWithId(placeCellId);
            if (!(place instanceof PlaceCell)) {
                return story;
            }
            const named = story.cellWithId(parentCellId);
            const parent = named instanceof PlaceCell ? named : null;
            const aroundTheParent =
                parent === null ? [] : placesAround(parent, story);
            const parentLiesWithinThePlace =
                parent !== null &&
                (parent.uniqueId === place.uniqueId ||
                    aroundTheParent.some(
                        (outer) => outer.uniqueId === place.uniqueId,
                    ));
            if (parentLiesWithinThePlace) {
                return story;
            }
            const placed = place.withParent(parent);
            const storyChanged = story.withCell(placed);
            return storyChanged;
        });
    }
}
