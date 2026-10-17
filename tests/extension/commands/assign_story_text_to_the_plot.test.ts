import { describe, expect, it } from "vitest";

import { AssignStoryTextToThePlotCommand } from "../../../extension/vscode_runtime/commands/assign_story_text_to_the_plot";
import { openStory } from "./open_story";

function storyOfTheDoor(words: string) {
    return openStory(`
<!-- cell: markdown id="c1" -->

She saw the door.

<!-- cell: plot title="The door" ${words} id="p1" -->

She finds the door.
`);
}

describe("AssignStoryTextToThePlotCommand — adds the selected words to a plot's trajectory", () => {
    it("assigns every word the selection touches", () => {
        const session = storyOfTheDoor("");

        new AssignStoryTextToThePlotCommand().invoke(session, {
            plotCellId: "p1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        const trajectoryAsItIsWritten =
            session.document.cellWithId("p1")?.attrs.words;
        expect(trajectoryAsItIsWritten).toBe("1-3");
    });

    it("adds them after the words the trajectory already holds", () => {
        const session = storyOfTheDoor('words="3-3"');

        new AssignStoryTextToThePlotCommand().invoke(session, {
            plotCellId: "p1",
            cellId: "c1",
            startCharacterOffsetInCell: 0,
            endCharacterOffsetInCell: 3,
        });

        const trajectoryAsItIsWritten =
            session.document.cellWithId("p1")?.attrs.words;
        expect(trajectoryAsItIsWritten).toBe("3-3, 0-0");
    });

    it("leaves the trajectory as it is when it already holds those words", () => {
        const session = storyOfTheDoor('words="1-3"');

        new AssignStoryTextToThePlotCommand().invoke(session, {
            plotCellId: "p1",
            cellId: "c1",
            startCharacterOffsetInCell: 5,
            endCharacterOffsetInCell: 13,
        });

        const trajectoryAsItIsWritten =
            session.document.cellWithId("p1")?.attrs.words;
        expect(trajectoryAsItIsWritten).toBe("1-3");
    });

    it("assigns nothing when the selection touches no word", () => {
        const session = storyOfTheDoor("");

        new AssignStoryTextToThePlotCommand().invoke(session, {
            plotCellId: "p1",
            cellId: "c1",
            startCharacterOffsetInCell: 3,
            endCharacterOffsetInCell: 4,
        });

        const trajectoryAsItIsWritten =
            session.document.cellWithId("p1")?.attrs.words;
        expect(trajectoryAsItIsWritten).toBe(undefined);
    });
});
