import { describe, expect, it, vi } from "vitest";

import { AssignStoryTextToPlotCommand } from "../../../extension/vscode_runtime/commands/assign_story_text_to_plot";
import { PlotNode } from "../../../extension/library/storydoc/cells/plot_cell";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import { openStory } from "./open_story";

describe("AssignStoryTextToPlotCommand — adds the selected words to a plot's trajectory", () => {
    it("adds a node holding every word the selection touches", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

She finds the door.
`);
        vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
            "3f1c0e2a-0000-4000-8000-000000000001",
        );

        new AssignStoryTextToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [
                new PlotNode(
                    "3f1c0e2a-0000-4000-8000-000000000001",
                    new StoryWordRange(1, 3),
                ),
            ],
        });
    });

    it("adds nothing when the words are a node already", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" nodes="n1:1-3" id="p1" -->

She finds the door.
`);

        new AssignStoryTextToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [new PlotNode("n1", new StoryWordRange(1, 3))],
        });
    });

    it("adds nothing when the selection touches no word", () => {
        const session = openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" id="p1" -->

She finds the door.
`);

        new AssignStoryTextToPlotCommand().invoke(session, {
            annotationCellId: "p1",
            cellId: "c1",
            startCharacterOffsetInCell: 3,
            endCharacterOffsetInCell: 4,
        });

        expect(session.document.cellWithId("p1")).toMatchObject({
            nodes: [],
        });
    });
});
