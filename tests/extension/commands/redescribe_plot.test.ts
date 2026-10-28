import { describe, expect, it } from "vitest";

import { RedescribePlotCommand } from "../../../extension/vscode_runtime/commands/redescribe_plot";
import { ChangePlotEventCommand } from "../../../extension/vscode_runtime/commands/change_plot_event";
import { PlotNode } from "../../../extension/library/storydoc/cells/plot_cell";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import { openStory } from "./open_story";

const THE_STORY = `
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

<ol title="She finds the door.">
<li id="e1" timestamp="1.1" location="the hall" words="2-3">She finds the door.</li>
</ol>
`;

describe("RedescribePlotCommand — gives a plot a new overview", () => {
    it("keeps its events, and what was said of them since", () => {
        const session = openStory(THE_STORY);
        new ChangePlotEventCommand().invoke(session, {
            annotationCellId: "p1",
            nodeId: "e1",
            field: "timestamp",
            said: "2.1",
        });

        new RedescribePlotCommand().invoke(session, {
            annotationCellId: "p1",
            overview: "She finds a door.",
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            overview: "She finds a door.",
            nodes: [
                new PlotNode("e1", new StoryWordRange(2, 3), "2.1", "the hall", "She finds the door."),
            ],
        });
    });
});
