import { describe, expect, it } from "vitest";

import { FixProseCommand } from "../../../extension/vscode_runtime/commands/fix_prose";
import { storyOfThreeCells } from "./open_story";

describe("FixProseCommand — fixes one prose error", () => {
    it("writes the correct version over the words the error covers", () => {
        const document = storyOfThreeCells();
        new FixProseCommand().invoke(document, {
            cellId: "c2",
            startCharacterOffsetInCell: 4,
            endCharacterOffsetInCell: 7,
            wordsInTheCell: "saw",
            isVisible: true,
            ruleThatFoundTheError: "filter-word",
            isAnErrorOf: "style",
            reasonForError: "It reports.",
            correctVersion: "opened",
        });
        expect(document.cells[1].source).toBe("She opened the door.");
    });

    it("leaves the prose alone when the error carries no correction", () => {
        const document = storyOfThreeCells();
        new FixProseCommand().invoke(document, {
            cellId: "c2",
            startCharacterOffsetInCell: 4,
            endCharacterOffsetInCell: 7,
            wordsInTheCell: "saw",
            isVisible: true,
            ruleThatFoundTheError: "monotony",
            isAnErrorOf: "style",
            reasonForError: "Every sentence opens the same way.",
            correctVersion: "",
        });
        expect(document.cells[1].source).toBe("She saw the door.");
    });
});
