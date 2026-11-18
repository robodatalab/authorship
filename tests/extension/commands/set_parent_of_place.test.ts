import { describe, expect, it } from "vitest";

import { SetParentOfPlaceCommand } from "../../../extension/vscode_runtime/commands/set_parent_of_place";
import type { PlaceCell } from "authordoc/cells/place_cell";
import { openStory } from "./open_story";

const THE_STORY = `<!-- cell: place id="en" title="England" -->

<!-- cell: place id="hv" title="Hollowmere" parent="en" -->

<!-- cell: place id="ln" title="The lane" parent="hv" -->

<!-- cell: place id="hg" title="Harrowgate" -->

<!-- cell: character id="v1" title="Varn" -->
`;

describe("SetParentOfPlaceCommand — puts a place within another", () => {
    it.each([
        ["puts it within the place given", "hg", "en", "en"],
        ["moves it to the place given", "ln", "hg", "hg"],
        ["takes it out of its parent, given none", "hv", "", ""],
        ["takes it out of its parent, given a cell that is not a place", "hv", "v1", ""],
        ["leaves it where it is rather than within itself", "hv", "hv", "en"],
        ["leaves it where it is rather than within a place that lies within it", "en", "ln", ""],
    ])("%s", (_, placeCellId, parentCellId, expected) => {
        const session = openStory(THE_STORY);

        new SetParentOfPlaceCommand().invoke(session, { placeCellId, parentCellId });

        const place = session.document.cellWithId(placeCellId) as PlaceCell;
        expect(place._parent).toBe(expected);
    });
});
