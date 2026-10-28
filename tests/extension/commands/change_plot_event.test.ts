import { describe, expect, it } from "vitest";

import { ChangePlotEventCommand } from "../../../extension/vscode_runtime/commands/change_plot_event";
import { PlotNode } from "authordoc/cells/plot_cell";
import { StoryWordRange } from "authordoc/cells/story_word_range";
import { openStory } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" location="the hall" words="2-3">She finds the door.</li>
<li id="e2" timestamp="1.2" location="the hall">She opens the door.</li>
</ol>
`;

describe("ChangePlotEventCommand — says one thing of one event of a plot", () => {
    it.each([
        ["summary", "She finds the red door.", new PlotNode("e1", new StoryWordRange(2, 3), "1.1", "the hall", "She finds the red door.")],
        ["timestamp", "2.1", new PlotNode("e1", new StoryWordRange(2, 3), "2.1", "the hall", "She finds the door.")],
        ["location", "the hall, by the stairs", new PlotNode("e1", new StoryWordRange(2, 3), "1.1", "the hall, by the stairs", "She finds the door.")],
    ])("says its %s, and nothing else", (field, said, eventChanged) => {
        const session = openStory(THE_STORY);

        new ChangePlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
            field,
            said,
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                eventChanged,
                new PlotNode("e2", null, "1.2", "the hall", "She opens the door."),
            ],
        });
    });

    it("keeps what was said of the event before, which the page may not have drawn yet", () => {
        const session = openStory(THE_STORY);
        const command = new ChangePlotEventCommand();

        command.invoke(session, { annotationCellId: "p1", nodeId: "e2", field: "summary", said: "She opens it." });
        command.invoke(session, { annotationCellId: "p1", nodeId: "e2", field: "timestamp", said: "1.3" });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("e1", new StoryWordRange(2, 3), "1.1", "the hall", "She finds the door."),
                new PlotNode("e2", null, "1.3", "the hall", "She opens it."),
            ],
        });
    });

    it.each([
        ["the plot has no such event", "e9", "summary"],
        ["nothing of the kind can be said of an event", "e1", "colour"],
    ])("changes nothing when %s", (_, nodeId, field) => {
        const session = openStory(THE_STORY);
        const plotBefore = session.document.cellWithId("p1");

        new ChangePlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId,
            field,
            said: "red",
        });

        expect(session.document.cellWithId("p1")).toEqual(plotBefore);
    });
});
