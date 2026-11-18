import { describe, expect, it } from "vitest";

import { Document } from "authordoc/storydoc";
import { StoryGraphLayout, type StoryGraphEvent } from "../../../extension/webview/author_editor/StoryGraphLayout";

const THE_STORY = `<!-- cell: character id="v1" title="Varn" -->

<!-- cell: character id="d1" title="Lia" -->

<!-- cell: place id="h1" title="The house" -->

<!-- cell: place id="h2" title="The court" -->

<!-- cell: place id="h3" title="The mill" -->

<!-- cell: plot id="p1" title="Love" edges="x1:e1>e2" -->

<ol>
<li id="e1" timestamp="1" place="h1" characters="v1">Varn asks Lia to walk.</li>
<li id="e2" timestamp="2" place="h2" characters="d1">Lia stands before the court.</li>
</ol>

<!-- cell: plot id="p2" title="Injustice" edges="y1:f1>f2" -->

<ol>
<li id="f1" timestamp="1" place="h3" characters="v1">Varn watches the mill.</li>
<li id="f2" timestamp="2.0" place="h2" characters="d1">Lia pleads for the weavers.</li>
</ol>
`;

const PLOTS: (readonly [string, string, number])[] = [
    ["p1", "Love", 0],
    ["p2", "Injustice", 0],
];
const CHARACTERS: (readonly [string, string, number])[] = [
    ["v1", "Varn", 0],
    ["d1", "Lia", 0],
];

describe("the layout of a story graph", () => {
    it("meets the events of different plots at the same moment and place in one event", () => {
        const layout = new StoryGraphLayout(new Document(THE_STORY), PLOTS, (event) => event.plotIds);

        expect(
            layout.events.map((event) => [event.eventId, event.summary, event.plotIds, event.characterIds]),
        ).toEqual([
            ["1@h1", "Varn asks Lia to walk.", ["p1"], ["v1"]],
            ["2@h2", "Lia stands before the court.", ["p1", "p2"], ["d1"]],
            ["1@h3", "Varn watches the mill.", ["p2"], ["v1"]],
        ]);
    });

    it("gives every moment a column, in order, the way the story writes it first", () => {
        const layout = new StoryGraphLayout(new Document(THE_STORY), PLOTS, (event) => event.plotIds);

        expect(layout.columns.map((column) => [column.momentWritten, column.middle])).toEqual([
            ["1", 230],
            ["2", 410],
        ]);
    });

    it.each([
        [
            "plots",
            PLOTS,
            (event: StoryGraphEvent) => event.plotIds,
            [
                ["p1", "Love", 28, 52],
                ["p2", "Injustice", 80, 52],
            ],
            [
                ["1@h1", "p1", 152, 38],
                ["2@h2", "p1", 332, 38],
                ["2@h2", "p2", 332, 90],
                ["1@h3", "p2", 152, 90],
            ],
            ["M 308 54 H 320 V 54 H 332", "M 308 106 H 320 V 106 H 332"],
        ],
        [
            "characters",
            CHARACTERS,
            (event: StoryGraphEvent) => event.characterIds,
            [
                ["v1", "Varn", 28, 92],
                ["d1", "Lia", 120, 52],
            ],
            [
                ["1@h1", "v1", 152, 38],
                ["2@h2", "d1", 332, 130],
                ["1@h3", "v1", 152, 78],
            ],
            ["M 308 54 H 320 V 146 H 332", "M 308 94 H 320 V 146 H 332"],
        ],
    ] as const)(
        "lays out the %s as rails, each event on the rail of everything it belongs to, connected along the plots",
        (_, rails, railIdsOf, expectedRails, expectedBoxes, expectedPaths) => {
            const layout = new StoryGraphLayout(new Document(THE_STORY), rails, railIdsOf);

            expect([
                layout.rails.map((rail) => [rail.railId, rail.title, rail.top, rail.height]),
                layout.boxes.map((box) => [box.eventId, box.railId, box.left, box.top]),
                layout.arrows.map((arrow) => arrow.path),
            ]).toEqual([expectedRails, expectedBoxes, expectedPaths]);
        },
    );

    it("puts an event on a rail of none when it belongs to none of the rails", () => {
        const layout = new StoryGraphLayout(new Document(THE_STORY), [["v1", "Varn", 0]], (event) => event.characterIds);

        expect(layout.rails.map((rail) => [rail.railId, rail.title])).toEqual([
            ["v1", "Varn"],
            ["", "None"],
        ]);
    });

    it("gives an event with no moment a column of its own, after the others", () => {
        const story = new Document(
            '<!-- cell: plot id="p1" title="Love" -->\n\n<ol>\n<li id="e1" timestamp="1">Varn asks.</li>\n<li id="e2">Lia waits.</li>\n</ol>\n',
        );

        const layout = new StoryGraphLayout(story, [["p1", "Love", 0]], (event) => event.plotIds);

        expect(layout.columns.map((column) => column.momentWritten)).toEqual(["1", "–"]);
    });

    it("is as wide as its columns and as tall as its rails", () => {
        const layout = new StoryGraphLayout(new Document(THE_STORY), PLOTS, (event) => event.plotIds);

        expect([layout.width, layout.height]).toEqual([500, 132]);
    });

    it("encloses the rails nested in a rail, set in by how deep they are nested", () => {
        const layout = new StoryGraphLayout(
            new Document(THE_STORY),
            [
                ["h0", "England", 0],
                ["h2", "The court", 1],
                ["h1", "The house", 1],
                ["h3", "The mill", 2],
            ],
            (event) => [event.placeId],
        );

        expect(
            layout.rails.map((rail) => [rail.railId, rail.left, rail.top, rail.height, rail.enclosedHeight, rail.titleWidth]),
        ).toEqual([
            ["h0", 0, 28, 52, 208, 116],
            ["h2", 12, 80, 52, 52, 104],
            ["h1", 12, 132, 52, 104, 104],
            ["h3", 24, 184, 52, 52, 92],
        ]);
    });

});
