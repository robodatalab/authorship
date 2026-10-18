import { describe, expect, it } from "vitest";

import { AssignStoryTextCommand } from "../../../extension/vscode_runtime/commands/assign_story_text";
import { openStory } from "./open_story";

function storyWithTheDoor(words: string) {
    return openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: salient-concept title="Door" ${words} id="k1" -->

What she saw.
`);
}

describe("AssignStoryTextCommand — assigns the selected words to a salient concept", () => {
    it("assigns every word the selection touches", () => {
        const session = storyWithTheDoor("");

        new AssignStoryTextCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("k1")?.attrs.words).toBe("1-3");
    });

    it("adds them to the words the concept already holds", () => {
        const session = storyWithTheDoor('words="0-0"');

        new AssignStoryTextCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        expect(session.document.cellWithId("k1")?.attrs.words).toBe(
            "0-0, 1-3",
        );
    });

    it("leaves the words as they are when they are assigned already", () => {
        const session = storyWithTheDoor('words="1-3"');

        new AssignStoryTextCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        const wordsAssigned = session.document.cellWithId("k1")?.attrs.words;
        expect(wordsAssigned).toBe("1-3");
    });

    it("assigns nothing when the selection touches no word", () => {
        const session = storyWithTheDoor("");

        new AssignStoryTextCommand().invoke(session, {
            annotationCellId: "k1",
            cellId: "c1",
            startCharacterOffsetInCell: 3,
            endCharacterOffsetInCell: 4,
        });

        expect(session.document.cellWithId("k1")?.attrs.words).toBe(undefined);
    });
});
