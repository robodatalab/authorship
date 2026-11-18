import { describe, expect, it } from "vitest";

import { MovePlaceCommand } from "../../../extension/vscode_runtime/commands/move_place";
import type { PlaceCell } from "authordoc/cells/place_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: place id="en" title="England" -->

<!-- cell: place id="hv" title="Hollowmere" parent="en" -->

<!-- cell: place id="ln" title="The lane" parent="hv" -->

<!-- cell: place id="hg" title="Harrowgate" -->

<!-- cell: character id="v1" title="Varn" -->
`;

describe("MovePlaceCommand — moves a place within another", () => {
    it.each([
        ["puts it within the place given, before the cell given", "hg", "hv", "en", ["en", "hg", "hv", "ln", "v1"], "en"],
        ["moves it to the place given", "ln", "hg", "hg", ["en", "hv", "ln", "hg", "v1"], "hg"],
        ["takes it out of its parent, given none", "hv", "v1", "", ["en", "ln", "hg", "hv", "v1"], ""],
        ["takes it out of its parent, given a cell that is not a place", "hv", "v1", "v1", ["en", "ln", "hg", "hv", "v1"], ""],
        ["leaves it where it is rather than within itself", "hv", "en", "hv", ["en", "hv", "ln", "hg", "v1"], "en"],
        ["leaves it where it is rather than within a place that lies within it", "en", "hg", "ln", ["en", "hv", "ln", "hg", "v1"], ""],
    ])("%s", (_, placeCellId, beforeCellId, parentCellId, expectedCellIds, expectedParent) => {
        const session = openStory(THE_STORY);

        new MovePlaceCommand().invoke(session, { placeCellId, beforeCellId, parentCellId });

        const cellIds = session.document.cells.map((cell) => cell.uniqueId);
        const place = session.document.cellWithId(placeCellId) as PlaceCell;
        expect([cellIds, place._parent]).toEqual([expectedCellIds, expectedParent]);
    });
});
