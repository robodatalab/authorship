import { describe, expect, it } from "vitest";

import { ReplaceMarkdownCommand } from "../../../extension/vscode_runtime/commands/replace_markdown";
import { storyOfThreeCells } from "./open_story";

describe("ReplaceMarkdownCommand — replaces a cell's markdown", () => {
    it("writes the new markdown into that cell and no other", () => {
        const document = storyOfThreeCells();
        new ReplaceMarkdownCommand().invoke(document, {
            cellIndex: 1,
            markdown: "She saw the door was open.",
        });
        expect(document.cells[1].source).toBe("She saw the door was open.");
        expect(document.cells[2].source).toBe("He heard the bell.");
    });
});
