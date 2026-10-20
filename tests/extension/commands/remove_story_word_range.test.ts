import { describe, expect, it } from "vitest";

import { RemoveStoryWordRangeCommand } from "../../../extension/vscode_runtime/commands/remove_story_word_range";
import { StoryWordRange } from "../../../extension/library/storydoc/cells/story_word_range";
import { openStory } from "./open_story";

function storyWithTheDoor(words: string) {
    return openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: salient-concept title="Door" words="${words}" id="k1" -->

What she saw.
`);
}

describe("RemoveStoryWordRangeCommand — takes words out of a salient concept", () => {
    it("removes the range it was asked to and keeps the others", () => {
        const session = storyWithTheDoor("1-1, 2-3");

        new RemoveStoryWordRangeCommand().invoke(session, {
            annotationCellId: "k1",
            firstWord: 2,
            lastWord: 3,
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            storyWordRanges: [new StoryWordRange(1, 1)],
        });
    });

    it("keeps the ranges it was not asked to remove in the order they are written", () => {
        const session = storyWithTheDoor("3-3, 1-1, 0-0");

        new RemoveStoryWordRangeCommand().invoke(session, {
            annotationCellId: "k1",
            firstWord: 1,
            lastWord: 1,
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            storyWordRanges: [
                new StoryWordRange(3, 3),
                new StoryWordRange(0, 0),
            ],
        });
    });

    it("leaves the concept without words once its last range is removed", () => {
        const session = storyWithTheDoor("2-3");

        new RemoveStoryWordRangeCommand().invoke(session, {
            annotationCellId: "k1",
            firstWord: 2,
            lastWord: 3,
        });

        expect(session.document.cellWithId("k1")).toMatchObject({
            storyWordRanges: [],
        });
    });
});
