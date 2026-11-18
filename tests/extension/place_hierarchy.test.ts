import { describe, expect, it } from "vitest";

import { PlaceCell } from "authordoc/cells/place_cell";
import { Document } from "authordoc/storydoc";
import { placesAround, placesNestedIn } from "../../extension/vscode_runtime/place_hierarchy";

const ENGLAND = '<!-- cell: place id="en" title="England" -->\n';
const HOLLOWMERE = '<!-- cell: place id="hv" title="Hollowmere" parent="en" -->\n';
const THE_LANE = '<!-- cell: place id="ln" title="The lane" parent="hv" -->\n';
const HARROWGATE = '<!-- cell: place id="hg" title="Harrowgate" parent="en" -->\n';

describe("the places a place lies within", () => {
    it.each([
        ["every one up to the outermost, the nearest first", [ENGLAND, HOLLOWMERE, THE_LANE], "ln", ["hv", "en"]],
        ["none for the outermost", [ENGLAND, HOLLOWMERE], "en", []],
        ["none when its parent is gone", [HOLLOWMERE, THE_LANE], "hv", []],
        [
            "none when the places it lies within lie within one another in a circle",
            [
                '<!-- cell: place id="a" title="A" parent="b" -->\n',
                '<!-- cell: place id="b" title="B" parent="a" -->\n',
                '<!-- cell: place id="c" title="C" parent="a" -->\n',
            ],
            "c",
            [],
        ],
    ])("are %s", (_, written, placeId, expected) => {
        const story = new Document(written.join("\n"));
        const place = story.cellWithId(placeId) as PlaceCell;

        const around = placesAround(place, story);

        expect(around.map((outer) => outer.uniqueId)).toEqual(expected);
    });
});

describe("the places nested in every place", () => {
    it("are the places whose parent it is, in the order of the story", () => {
        const story = new Document([ENGLAND, HOLLOWMERE, THE_LANE, HARROWGATE].join("\n"));

        const nested = placesNestedIn(story);

        expect(
            [...nested.entries()].map(([parentId, places]) => [parentId, places.map((place) => place.uniqueId)]),
        ).toEqual([
            ["en", ["hv", "hg"]],
            ["hv", ["ln"]],
        ]);
    });
});
