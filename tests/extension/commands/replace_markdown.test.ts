import { describe, expect, it } from "vitest";

import { ReplaceMarkdownCommand } from "../../../extension/vscode_runtime/commands/replace_markdown";
import { storyOfThreeCells } from "./open_story";

describe("ReplaceMarkdownCommand — replaces a cell's markdown", () => {
    it("writes the new markdown into that cell and no other", () => {
        const document = storyOfThreeCells();
        new ReplaceMarkdownCommand().invoke(document, {
            cellId: "c2",
            markdown: "She saw the door was open.",
        });
        expect(document.cells[1].source).toBe("She saw the door was open.");
        expect(document.cells[2].source).toBe("He heard the bell.");
    });

    it("writes nothing when there is no cell at that index", () => {
        const document = storyOfThreeCells();
        new ReplaceMarkdownCommand().invoke(document, {
            cellId: "nowhere",
            markdown: "nowhere",
        });
        expect(document.text).not.toContain("nowhere");
    });
});
