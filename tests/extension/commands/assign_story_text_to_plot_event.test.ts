import { describe, expect, it } from "vitest";

import { AssignStoryTextToPlotEventCommand } from "../../../extension/vscode_runtime/commands/assign_story_text_to_plot_event";
import { PlotNode } from "authordoc/cells/plot_cell";
import { StoryWordRange } from "authordoc/cells/story_word_range";
import { openStory } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" location="the hall">She finds the door.</li>
<li id="e2" timestamp="1.2" location="the hall" words="0-0">She opens the door.</li>
</ol>
`;

describe("AssignStoryTextToPlotEventCommand — makes the selected words the story text of one event", () => {
    it("gives an event the story does not tell yet every word the selection touches", () => {
        const session = openStory(THE_STORY);

        new AssignStoryTextToPlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("e1", new StoryWordRange(1, 3), "1.1", "the hall", "She finds the door."),
                new PlotNode("e2", new StoryWordRange(0, 0), "1.2", "the hall", "She opens the door."),
            ],
        });
    });

    it("puts the words selected in place of the ones that told the event", () => {
        const session = openStory(THE_STORY);

        new AssignStoryTextToPlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e2",
            cellId: "c1",
            startCharacterOffsetInCell: 8,
            endCharacterOffsetInCell: 17,
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode("e1", null, "1.1", "the hall", "She finds the door."),
                new PlotNode("e2", new StoryWordRange(2, 3), "1.2", "the hall", "She opens the door."),
            ],
        });
    });

    it.each([
        ["the selection touches no word", "e1", 3, 4],
        ["the plot has no such event", "e9", 5, 13],
    ])("changes nothing when %s", (_, nodeId, start, end) => {
        const session = openStory(THE_STORY);
        const plotBefore = session.document.cellWithId("p1");

        new AssignStoryTextToPlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId,
            cellId: "c1",
            startCharacterOffsetInCell: start,
            endCharacterOffsetInCell: end,
        });

        expect(session.document.cellWithId("p1")).toEqual(plotBefore);
    });
});
