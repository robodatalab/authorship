import { describe, expect, it } from "vitest";

import { RemoveStoryTextFromPlotEventCommand } from "../../../extension/vscode_runtime/commands/remove_story_text_from_plot_event";
import { ChangePlotEventCommand } from "../../../extension/vscode_runtime/commands/change_plot_event";
import { PlotNode } from "authordoc/cells/plot_cell";
import { openStory } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" location="the hall" words="2-3">She finds the door.</li>
</ol>
`;

describe("RemoveStoryTextFromPlotEventCommand — leaves an event told by no story text", () => {
    it("takes the words away and keeps the event, and what was said of it", () => {
        const session = openStory(THE_STORY);
        new ChangePlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
            field: "summary",
            said: "She finds it.",
        });

        new RemoveStoryTextFromPlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [new PlotNode("e1", null, "1.1", "the hall", "She finds it.")],
        });
    });

    it("changes nothing when the plot has no such event", () => {
        const session = openStory(THE_STORY);
        const plotBefore = session.document.cellWithId("p1");

        new RemoveStoryTextFromPlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e9",
        });

        expect(session.document.cellWithId("p1")).toEqual(plotBefore);
    });
});
