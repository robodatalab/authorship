import { describe, expect, it } from "vitest";

import { AddEventToPlotCommand } from "../../../extension/vscode_runtime/commands/add_event_to_plot";
import { PlotNode } from "authordoc/cells/plot_cell";
import { StoryWordRange } from "authordoc/cells/story_word_range";
import { openStory } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" location="the hall" words="2-3">She finds the door.</li>
</ol>
`;

describe("AddEventToPlotCommand — adds an event no story text tells yet", () => {
    it("adds it, with the id it is given, at the end of the trajectory", () => {
        const session = openStory(THE_STORY);

        new AddEventToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e2",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("e1", new StoryWordRange(2, 3), "1.1", "the hall", "She finds the door."),
                new PlotNode("e2", null),
            ],
        });
    });

    it("adds nothing when the plot has an event with that id already", () => {
        const session = openStory(THE_STORY);
        const plotBefore = session.document.cellWithId("p1");

        new AddEventToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
        });

        expect(session.document.cellWithId("p1")).toEqual(plotBefore);
    });
});
