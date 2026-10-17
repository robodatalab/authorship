import { describe, expect, it } from "vitest";

import { RemoveStoryWordRangeFromThePlotCommand } from "../../../extension/vscode_runtime/commands/remove_story_word_range_from_the_plot";
import { openStory } from "./open_story";

function storyOfTheDoor(words: string) {
    return openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" words="${words}" id="p1" -->

She finds the door.
`);
}

describe("RemoveStoryWordRangeFromThePlotCommand — takes words out of a plot's trajectory", () => {
    it("removes the range it was asked to and keeps the others in their order", () => {
        const session = storyOfTheDoor("3-3, 1-1, 0-0");

        new RemoveStoryWordRangeFromThePlotCommand().invoke(session, {
            plotCellId: "p1",
            firstWord: 1,
            lastWord: 1,
        });

        const trajectoryAsItIsWritten =
            session.document.cellWithId("p1")?.attrs.words;
        expect(trajectoryAsItIsWritten).toBe("3-3, 0-0");
    });

    it("leaves the plot without a trajectory once its last range is removed", () => {
        const session = storyOfTheDoor("2-3");

        new RemoveStoryWordRangeFromThePlotCommand().invoke(session, {
            plotCellId: "p1",
            firstWord: 2,
            lastWord: 3,
        });

        const trajectoryAsItIsWritten =
            session.document.cellWithId("p1")?.attrs.words;
        expect(trajectoryAsItIsWritten).toBe(undefined);
    });
});
