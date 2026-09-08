import { describe, expect, it } from "vitest";

import { ReplaceAttributeCommand } from "../../../extension/vscode_runtime/commands/replace_attribute";
import { storyOfThreeCells } from "./open_story";

describe("ReplaceAttributeCommand — replaces a cell's attribute", () => {
    it("writes the new value into that cell's marker", () => {
        const document = storyOfThreeCells();
        new ReplaceAttributeCommand().invoke(document, {
            cellId: "c1",
            attributeName: "title",
            attributeValue: "The Door",
        });
        expect(document.cells[0].attrs.title).toBe("The Door");
        expect(document.text).toContain('title="The Door"');
    });

    it("writes nothing when there is no cell at that index", () => {
        const document = storyOfThreeCells();
        new ReplaceAttributeCommand().invoke(document, {
            cellId: "nowhere",
            attributeName: "title",
            attributeValue: "Nowhere",
        });
        expect(document.text).not.toContain("Nowhere");
    });
});
